import Foundation

/// The same files as on Android: the workout data, this device's own sign-in and sync notes ("meta"), and the setup and meal
/// photos, in the app's Application Support folder (which iPhone backs up to iCloud with the rest of the phone).
final class Files {
    static let shared = Files()

    let dir: URL
    let photos: URL

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        dir = base.appendingPathComponent("GymDay", isDirectory: true)
        photos = dir.appendingPathComponent("photos", isDirectory: true)
        try? FileManager.default.createDirectory(at: photos, withIntermediateDirectories: true)
    }

    private var dataFile: URL { dir.appendingPathComponent("gymday-data.json") }
    private var metaFile: URL { dir.appendingPathComponent("gymday-meta.json") }

    func loadData() -> String { (try? String(contentsOf: dataFile, encoding: .utf8)) ?? "" }
    func loadMeta() -> String { (try? String(contentsOf: metaFile, encoding: .utf8)) ?? "" }

    @discardableResult func saveData(_ json: String) -> Bool { write(json, to: dataFile) }
    @discardableResult func saveMeta(_ json: String) -> Bool { write(json, to: metaFile) }

    private func write(_ s: String, to url: URL) -> Bool {
        do {
            try Data(s.utf8).write(to: url, options: [.atomic])
            return true
        } catch {
            return false
        }
    }

    static func safeId(_ id: String) -> String {
        let s = String(id.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "_" || $0 == "-" })
        return s.isEmpty ? "x" : String(s.prefix(120))
    }

    private func photoFile(_ id: String) -> URL { photos.appendingPathComponent(Self.safeId(id) + ".jpg") }

    /// dataUrl = "data:image/jpeg;base64,…"
    @discardableResult func savePhoto(id: String, dataUrl: String) -> Bool {
        let b64 = dataUrl.firstIndex(of: ",").map { String(dataUrl[dataUrl.index(after: $0)...]) } ?? dataUrl
        guard let d = Data(base64Encoded: b64, options: [.ignoreUnknownCharacters]) else { return false }
        do {
            try d.write(to: photoFile(id), options: [.atomic])
            return true
        } catch {
            return false
        }
    }

    func loadPhoto(id: String) -> String {
        guard let d = try? Data(contentsOf: photoFile(id)) else { return "" }
        return "data:image/jpeg;base64," + d.base64EncodedString()
    }

    func deletePhoto(id: String) {
        try? FileManager.default.removeItem(at: photoFile(id))
    }
}
