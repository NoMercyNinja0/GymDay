import UIKit
import HealthKit

/// Apple Health in place of Android's Health Connect, answering the page in the same JSON shapes (HealthBridge.java,
/// HealthDay.java and Sessions.java on Android). Read only, except that finished workouts are saved there when the person
/// turns that on. Apple never tells an app which kinds of data it may read (a "no" looks like "nothing recorded"), so "allowed"
/// here means "the person has been asked"; anything they said no to simply comes back empty.
final class Health {
    enum Ask: String { case basic, auto, weight, workouts, write }

    private weak var bridge: Bridge?
    private let store = HKHealthStore()
    private let defaults = UserDefaults.standard
    private static let selfBundle = Bundle.main.bundleIdentifier ?? "app.gymday"

    init(bridge: Bridge) { self.bridge = bridge }

    private static func q(_ id: HKQuantityTypeIdentifier) -> HKQuantityType { HKQuantityType(id) }
    private static let hr = q(.heartRate), active = q(.activeEnergyBurned), basal = q(.basalEnergyBurned), steps = q(.stepCount)
    private static let rest = q(.restingHeartRate), hrv = q(.heartRateVariabilitySDNN), spo2 = q(.oxygenSaturation), br = q(.respiratoryRate)
    private static let mass = q(.bodyMass)
    private static let sleep = HKCategoryType(.sleepAnalysis)
    private static let workout = HKObjectType.workoutType()

    private static func reads(_ a: Ask) -> Set<HKObjectType> {
        switch a {
        case .basic: return [hr, active, basal]
        case .auto: return [hr, active, basal, steps, sleep, rest, hrv, spo2, br]
        case .weight: return [mass]
        case .workouts: return [workout]
        case .write: return []
        }
    }

    private func asked(_ a: Ask) -> Bool { defaults.bool(forKey: "hk.asked." + a.rawValue) }
    var available: Bool { HKHealthStore.isHealthDataAvailable() }
    private var canWrite: Bool { available && store.authorizationStatus(for: Self.workout) == .sharingAuthorized }

    /// What the page's hcStatus() expects (see health.js): sdk 34 = "the phone's own Health app", as Android 14 and newer.
    func statusObject() -> [String: Any] {
        let auto = asked(.auto)
        var perm: [String: Any] = [:]
        for k in ["hr", "active", "total", "steps", "sleep", "rest", "hrv", "spo2", "br"] { perm[k] = auto }
        return ["sdk": 34, "available": available, "install": false, "granted": available && (asked(.basic) || auto), "write": canWrite,
                "perm": perm, "asked": asked(.basic) || auto, "ios": true]
    }

    private func autoPerms() -> String {
        var perm: [String: Any] = [:]
        for k in ["hr", "active", "total", "steps", "sleep", "rest", "hrv", "spo2", "br"] { perm[k] = asked(.auto) }
        return J.text(perm)
    }

    /// Shows Apple Health's own "allow" sheet; the answer goes to the same callback as on Android.
    func request(_ a: Ask) {
        guard available else { bridge?.toast("This iPhone can't use Apple Health"); return }
        let share: Set<HKSampleType> = a == .write ? [Self.workout] : []
        store.requestAuthorization(toShare: share, read: Self.reads(a)) { ok, _ in
            DispatchQueue.main.async {
                if ok { self.defaults.set(true, forKey: "hk.asked." + a.rawValue) }
                self.bridge?.set("hc", self.statusObject())
                switch a {
                case .basic: self.bridge?.call("onHealthPerm", ok && self.asked(.basic))
                case .auto: self.bridge?.call("onHealthAutoPerm", self.autoPerms())
                case .weight: self.bridge?.call("onHealthWeightPerm", ok && self.asked(.weight))
                case .workouts: self.bridge?.call("onHealthExerPerm", ok && self.asked(.workouts))
                case .write: self.bridge?.call("onHealthWritePerm", self.canWrite)
                }
            }
        }
    }

    /// Where the person changes what GymDay may read: the Health app (Profile → Apps → GymDay), or GymDay's page in Settings.
    func open() {
        if let u = URL(string: "x-apple-health://"), UIApplication.shared.canOpenURL(u) {
            UIApplication.shared.open(u)
        } else if let u = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(u)
        }
    }

    private func answer(_ key: String, _ o: [String: Any]) {
        let s = J.text(o)
        DispatchQueue.main.async { self.bridge?.call("onHealthData", key, s) }
    }

    // MARK: small helpers around HealthKit's queries

    private static func range(_ a: Date, _ b: Date) -> NSPredicate { HKQuery.predicateForSamples(withStart: a, end: b, options: []) }
    private static func date(_ ms: Double) -> Date { Date(timeIntervalSince1970: ms / 1000) }
    private static func ms(_ d: Date) -> Double { (d.timeIntervalSince1970 * 1000).rounded() }
    private static let bpm = HKUnit.count().unitDivided(by: .minute())

    private func stats(_ t: HKQuantityType, _ a: Date, _ b: Date, _ opt: HKStatisticsOptions, _ done: @escaping (HKStatistics?) -> Void) {
        let query = HKStatisticsQuery(quantityType: t, quantitySamplePredicate: Self.range(a, b), options: opt) { _, s, _ in done(s) }
        store.execute(query)
    }

    private func samples(_ t: HKSampleType, _ a: Date, _ b: Date, limit: Int = HKObjectQueryNoLimit, newestFirst: Bool = false,
                         _ done: @escaping ([HKSample]) -> Void) {
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: !newestFirst)]
        let query = HKSampleQuery(sampleType: t, predicate: Self.range(a, b), limit: limit, sortDescriptors: sort) { _, r, _ in done(r ?? []) }
        store.execute(query)
    }

    private static func put1(_ o: inout [String: Any], _ k: String, _ v: Double?) {
        guard let v = v, v.isFinite else { return }
        o[k] = (v * 10).rounded() / 10
    }

    // MARK: one workout's heart rate and calories (hcRead)

    /// {"ok":true, "avg","max","min" (beats a minute), "kcal", "kind":"active"|"total"}; a number is left out when nothing was recorded.
    func read(key: String, from: Double, to: Double) {
        guard available, from > 0, to > from else { answer(key, ["ok": false]); return }
        let a = Self.date(from), b = Self.date(to)
        var out: [String: Any] = ["ok": true]
        stats(Self.hr, a, b, [.discreteAverage, .discreteMax, .discreteMin]) { s in
            if let s = s {
                if let v = s.averageQuantity()?.doubleValue(for: Self.bpm) { out["avg"] = v.rounded() }
                if let v = s.maximumQuantity()?.doubleValue(for: Self.bpm) { out["max"] = v.rounded() }
                if let v = s.minimumQuantity()?.doubleValue(for: Self.bpm) { out["min"] = v.rounded() }
            }
            self.stats(Self.active, a, b, .cumulativeSum) { s1 in
                let ak = s1?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
                self.stats(Self.basal, a, b, .cumulativeSum) { s2 in
                    let bk = s2?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
                    if ak >= 1 {
                        out["kcal"] = ak
                        out["kind"] = "active"
                    } else if ak + bk >= 1 && out["avg"] != nil {
                        // "total" includes what the body burns at rest, which the phone estimates with no watch at all,
                        // so it is only used when a heart rate shows something was really recording (as on Android)
                        out["kcal"] = ak + bk
                        out["kind"] = "total"
                    }
                    self.answer(key, out)
                }
            }
        }
    }

    // MARK: one day and the night that ended in it (hcDay, "automatic from your watch")

    func day(key: String, from: Double, to: Double) {
        let now = Date()
        guard available, from > 0, to > from, to - from <= 26 * 3_600_000 else { answer(key, ["ok": false]); return }
        let start = Self.date(from), end = Self.date(to)
        let upTo = min(end, now)
        guard upTo.timeIntervalSince(start) >= 60 else { answer(key, ["ok": false]); return }
        var out: [String: Any] = ["ok": true, "perm": J.parse(autoPerms()) ?? [:]]
        guard asked(.auto) else { answer(key, out); return }
        let group = DispatchGroup()
        let lock = NSLock()
        func put(_ k: String, _ v: Any) { lock.lock(); out[k] = v; lock.unlock() }

        // today: how far the watch's numbers reach, so the calories are counted up to there and no further
        var last = start
        if now < end {
            for t in [Self.active, Self.hr, Self.steps] {
                group.enter()
                samples(t, start, upTo, limit: 1, newestFirst: true) { r in
                    lock.lock(); if let e = r.first?.endDate, e > last { last = e }; lock.unlock()
                    group.leave()
                }
            }
        }
        group.notify(queue: .global()) {
            let calTo = now < end && last > start ? min(last, upTo) : upTo
            if now < end && last > start { put("upto", Self.ms(calTo)) }
            let g2 = DispatchGroup()
            g2.enter()
            self.stats(Self.steps, start, upTo, .cumulativeSum) { s in
                if let v = s?.sumQuantity()?.doubleValue(for: .count()), v > 0 { put("steps", v.rounded()) }
                g2.leave()
            }
            g2.enter()
            self.stats(Self.hr, start, upTo, [.discreteAverage, .discreteMax, .discreteMin]) { s in
                if let v = s?.averageQuantity()?.doubleValue(for: Self.bpm) { put("avg", v.rounded()) }
                if let v = s?.maximumQuantity()?.doubleValue(for: Self.bpm) { put("max", v.rounded()) }
                if let v = s?.minimumQuantity()?.doubleValue(for: Self.bpm) { put("min", v.rounded()) }
                g2.leave()
            }
            g2.enter()
            self.stats(Self.rest, start, upTo, .discreteAverage) { s in
                if let v = s?.averageQuantity()?.doubleValue(for: Self.bpm) { put("rest", v.rounded()) }
                g2.leave()
            }
            if calTo.timeIntervalSince(start) >= 60 {
                g2.enter()
                self.stats(Self.active, start, calTo, .cumulativeSum) { s in
                    let ak = s?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
                    self.stats(Self.basal, start, calTo, .cumulativeSum) { s2 in
                        let bk = s2?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
                        lock.lock()
                        if ak >= 1 { Self.put1(&out, "active", ak) }
                        if ak + bk >= 1 { Self.put1(&out, "total", ak + bk) }
                        lock.unlock()
                        g2.leave()
                    }
                }
            }
            // the night: every sleep saved from 20 hours before the day began, until 12 hours after it ended (or now)
            g2.enter()
            self.samples(Self.sleep, start.addingTimeInterval(-NightRules.lookBack), min(end.addingTimeInterval(NightRules.lookOn), now)) { r in
                let night = NightRules.night(Self.sleeps(r), from: start, to: upTo)
                if let n = night { put("night", n) }
                let w = NightRules.window(night, start: start, to: upTo)
                let g3 = DispatchGroup()
                for (k, t, unit, lo, hi, scale) in [("hrv", Self.hrv, HKUnit.secondUnit(with: .milli), 1.0, 300.0, 1.0),
                                                    ("spo2", Self.spo2, HKUnit.percent(), 50.0, 100.0, 100.0),
                                                    ("br", Self.br, Self.bpm, 4.0, 60.0, 1.0)] {
                    g3.enter()
                    self.samples(t, w.0, w.1, limit: 1000) { list in
                        let vals = list.compactMap { ($0 as? HKQuantitySample)?.quantity.doubleValue(for: unit) }.map { $0 * scale }
                        let m = NightRules.mean(vals, lo, hi)
                        lock.lock(); Self.put1(&out, k, m); lock.unlock()
                        g3.leave()
                    }
                }
                g3.notify(queue: .global()) { g2.leave() }
            }
            g2.notify(queue: .global()) {
                lock.lock(); let o = out; lock.unlock()
                self.answer(key, o)
            }
        }
    }

    /// Apple Health keeps sleep as one sample per stage; each becomes a one-stage "sleep" in Android's terms. A source that saved
    /// stages has its "in bed" samples left out (they would count the same hours twice); a source with only "in bed" (the
    /// iPhone's own sleep schedule) is counted from those.
    private static func sleeps(_ r: [HKSample]) -> [NightRules.Sleep] {
        var bySource: [String: [HKCategorySample]] = [:]
        for s in r { if let c = s as? HKCategorySample { bySource[c.sourceRevision.source.bundleIdentifier, default: []].append(c) } }
        var out: [NightRules.Sleep] = []
        for (app, list) in bySource {
            let staged = list.contains { $0.value != HKCategoryValueSleepAnalysis.inBed.rawValue }
            for c in list {
                let v = HKCategoryValueSleepAnalysis(rawValue: c.value)
                if staged && v == .inBed { continue }
                var s = NightRules.Sleep(start: c.startDate, end: c.endDate, app: app)
                if staged {
                    let type: Int
                    switch v {
                    case .asleepDeep: type = NightRules.DEEP
                    case .asleepREM: type = NightRules.REM
                    case .asleepCore: type = NightRules.LIGHT
                    case .awake: type = NightRules.AWAKE
                    default: type = NightRules.SLEEPING
                    }
                    s.stages.append(NightRules.Stage(start: c.startDate, end: c.endDate, type: type))
                }
                out.append(s)
            }
        }
        return out
    }

    // MARK: body weight (hcWeight)

    /// The last 90 days: {"ok":true,"items":[{"t":ms,"kg":70.4}]}; {"ok":false,"need":true} before the person has been asked.
    func weight(key: String) {
        guard available, asked(.weight) else { answer(key, ["ok": false, "need": true]); return }
        let now = Date()
        samples(Self.mass, now.addingTimeInterval(-90 * 86400), now) { r in
            let items: [[String: Any]] = r.compactMap { s in
                guard let q = s as? HKQuantitySample else { return nil }
                return ["t": Self.ms(q.startDate), "kg": (q.quantity.doubleValue(for: .gramUnit(with: .kilo)) * 100).rounded() / 100]
            }
            self.answer(key, ["ok": true, "items": items])
        }
    }

    // MARK: workouts other apps saved, for "forgot to log?" (hcSessions)

    func sessions(key: String, from: Double, to: Double) {
        guard available, asked(.workouts) else { answer(key, ["ok": false, "need": true]); return }
        samples(Self.workout, Self.date(from), Self.date(to), limit: 200) { r in
            var rows: [(Date, Date, String, String, String)] = []
            for s in r {
                guard let w = s as? HKWorkout else { continue }
                let app = w.sourceRevision.source.bundleIdentifier
                if app == Self.selfBundle { continue }                       // GymDay's own, saved when asked
                let d = w.endDate.timeIntervalSince(w.startDate)
                if d < 600 || d > 5 * 3600 { continue }
                rows.append((w.startDate, w.endDate, Self.kind(w.workoutActivityType), Self.title(w.workoutActivityType), w.sourceRevision.source.name))
            }
            rows.sort { $0.0 < $1.0 }
            let items: [[String: Any]] = rows.prefix(60).map { ["s": Self.ms($0.0), "e": Self.ms($0.1), "kind": $0.2, "title": $0.3, "app": $0.4] }
            self.answer(key, ["ok": true, "items": items])
        }
    }

    private static func kind(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .traditionalStrengthTraining, .functionalStrengthTraining, .coreTraining: return "gym"
        case .highIntensityIntervalTraining: return "hiit"
        case .other, .mixedCardio, .crossTraining: return "other"
        default: return "sport"
        }
    }

    private static func title(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .traditionalStrengthTraining: return "Strength training"
        case .functionalStrengthTraining: return "Functional strength training"
        case .coreTraining: return "Core training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .running: return "Run"
        case .walking: return "Walk"
        case .cycling: return "Cycling"
        case .swimming: return "Swim"
        case .yoga: return "Yoga"
        case .elliptical: return "Elliptical"
        case .rowing: return "Rowing"
        case .stairClimbing: return "Stairs"
        case .crossTraining: return "Cross training"
        case .mixedCardio: return "Cardio"
        default: return ""
        }
    }

    // MARK: saving GymDay's finished workouts to Apple Health (hcWrite / hcRemove)

    static func clientId(_ id: String) -> String {
        let c = String(id.unicodeScalars.filter { ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "_" || $0 == "-" }.prefix(64))
        return c.isEmpty ? "" : "gymday-" + c
    }

    /// {"id","start","end" (epoch ms),"title","notes","v"}. Saving the same workout again replaces the earlier copy.
    func write(key: String, json: String) {
        guard available else { answer(key, ["ok": false]); return }
        guard canWrite else { answer(key, ["ok": false, "need": true]); return }
        guard let o = J.parse(json) as? [String: Any] else { answer(key, ["ok": false]); return }
        let cid = Self.clientId(J.str(o, "id"))
        let s = J.num(o, "start"), e0 = J.num(o, "end")
        guard !cid.isEmpty, s > 0, e0 - s >= 60_000 else { answer(key, ["ok": false]); return }
        let e = min(e0, s + 24 * 3_600_000)
        var title = J.str(o, "title").trimmingCharacters(in: .whitespacesAndNewlines)
        if title.isEmpty { title = "Workout" }
        let notes = String(J.str(o, "notes").prefix(1000))
        let pred = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: [cid])
        store.deleteObjects(of: Self.workout, predicate: pred) { _, _, _ in
            let cfg = HKWorkoutConfiguration()
            cfg.activityType = .traditionalStrengthTraining
            cfg.locationType = .indoor
            let b = HKWorkoutBuilder(healthStore: self.store, configuration: cfg, device: .local())
            let start = Self.date(s), end = Self.date(e)
            b.beginCollection(withStart: start) { ok, _ in
                guard ok else { self.answer(key, ["ok": false]); return }
                var md: [String: Any] = [HKMetadataKeyExternalUUID: cid, HKMetadataKeyWasUserEntered: true, "GymDayTitle": String(title.prefix(100)),
                                         "GymDayVersion": max(1, Int(J.num(o, "v", 1)))]
                if !notes.isEmpty { md["GymDayNotes"] = notes }
                b.addMetadata(md) { _, _ in
                    b.endCollection(withEnd: end) { _, _ in
                        b.finishWorkout { w, _ in self.answer(key, ["ok": w != nil]) }
                    }
                }
            }
        }
    }

    func remove(key: String, idsJson: String) {
        guard available else { answer(key, ["ok": false]); return }
        guard canWrite else { answer(key, ["ok": false, "need": true]); return }
        let ids = ((J.parse(idsJson) as? [Any]) ?? []).prefix(50).compactMap { $0 as? String }.map { Self.clientId($0) }.filter { !$0.isEmpty }
        guard !ids.isEmpty else { answer(key, ["ok": true]); return }
        let pred = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: ids)
        store.deleteObjects(of: Self.workout, predicate: pred) { ok, _, _ in self.answer(key, ["ok": ok]) }
    }
}

/// How one night is found among the sleeps saved that day: the same rules as Android's HealthDay.java.
enum NightRules {
    static let UNKNOWN = 0, AWAKE = 1, SLEEPING = 2, OUT_OF_BED = 3, LIGHT = 4, DEEP = 5, REM = 6, AWAKE_IN_BED = 7
    /// Two sleeps closer together than this are one night: a watch often splits a night in two.
    static let gap: TimeInterval = 90 * 60
    static let longest: TimeInterval = 20 * 3600
    static let lookBack: TimeInterval = 20 * 3600
    static let lookOn: TimeInterval = 12 * 3600

    struct Stage { let start: Date; let end: Date; let type: Int }
    struct Sleep {
        let start: Date, end: Date, app: String
        var stages: [Stage] = []
        init(start: Date, end: Date, app: String) { self.start = start; self.end = end; self.app = app }
    }
    final class Block {
        var start = Date(), end = Date()
        var asleep = 0.0, deep = 0.0, rem = 0.0, light = 0.0, awake = 0.0
        var staged = false
        var n = 0
        var app = ""
        var minutes: Double { min(asleep, end.timeIntervalSince(start)) / 60 }
    }

    static func blocks(_ one: [Sleep]) -> [Block] {
        let list = one.sorted { $0.start < $1.start }
        var out: [Block] = []
        var cur: Block?
        var covered = Date.distantPast
        for s in list {
            if s.end <= s.start || s.end.timeIntervalSince(s.start) > longest { continue }
            if cur == nil || s.start.timeIntervalSince(cur!.end) > gap {
                let b = Block()
                b.start = s.start
                b.end = s.end
                b.app = s.app
                out.append(b)
                cur = b
                covered = s.start
            }
            let b = cur!
            let from = max(s.start, covered)
            if from < s.end { add(b, s, from) }
            b.end = max(b.end, s.end)
            covered = max(covered, s.end)
            b.n += 1
        }
        return out
    }

    private static func add(_ b: Block, _ s: Sleep, _ from: Date) {
        if s.stages.isEmpty {
            b.asleep += s.end.timeIntervalSince(from)
            return
        }
        b.staged = true
        for g in s.stages {
            let a = max(max(g.start, s.start), from), z = min(g.end, s.end)
            if z <= a { continue }
            let d = z.timeIntervalSince(a)
            switch g.type {
            case DEEP: b.deep += d; b.asleep += d
            case REM: b.rem += d; b.asleep += d
            case LIGHT: b.light += d; b.asleep += d
            case SLEEPING, UNKNOWN: b.asleep += d
            case AWAKE, AWAKE_IN_BED, OUT_OF_BED: b.awake += d
            default: break
            }
        }
    }

    /// The main sleep that ended after `from` and no later than `to`: the longest stretch any one source saved, where one with
    /// stages wins a near tie. Two sources that saved the same night are never added together. Nil when none is 30 min to 16 h.
    static func night(_ all: [Sleep], from: Date, to: Date) -> [String: Any]? {
        var byApp: [String: [Sleep]] = [:]
        for s in all { byApp[s.app, default: []].append(s) }
        var best: Block?
        var bestScore = 0.0
        for (_, l) in byApp.sorted(by: { $0.key < $1.key }) {
            for b in blocks(l) {
                if b.end <= from || b.end > to { continue }
                let m = b.minutes
                if m < 30 || m > 16 * 60 { continue }
                let score = m * (b.staged ? 1.25 : 1.0)
                if score > bestScore { best = b; bestScore = score }
            }
        }
        guard let b = best else { return nil }
        var o: [String: Any] = ["start": (b.start.timeIntervalSince1970 * 1000).rounded(), "end": (b.end.timeIntervalSince1970 * 1000).rounded(),
                                "min": b.minutes.rounded(), "staged": b.staged, "app": b.app, "n": b.n]
        if b.staged {
            for (k, v) in [("deep", b.deep), ("rem", b.rem), ("light", b.light), ("awake", b.awake)] {
                let m = (v / 60).rounded()
                if m > 0 { o[k] = m }
            }
        }
        return o
    }

    static func mean(_ v: [Double], _ lo: Double, _ hi: Double) -> Double? {
        let k = v.filter { $0.isFinite && $0 >= lo && $0 <= hi }
        return k.isEmpty ? nil : k.reduce(0, +) / Double(k.count)
    }

    /// The hours the night's readings are taken from: the night itself, or 6 pm to 11 am around the day's start.
    static func window(_ night: [String: Any]?, start: Date, to: Date) -> (Date, Date) {
        if let n = night {
            let a = J.num(n, "start"), b = J.num(n, "end")
            if b > a { return (Date(timeIntervalSince1970: a / 1000), Date(timeIntervalSince1970: b / 1000)) }
        }
        let a = start.addingTimeInterval(-6 * 3600)
        return (a, max(a.addingTimeInterval(60), min(start.addingTimeInterval(11 * 3600), to)))
    }
}
