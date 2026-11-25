/* GymDay on iPhone: gives the page the same "Android" bridge it has on Android phones, answered by the iPhone app (Bridge.swift).
   Calls that must answer at once (load, metaLoad, hcStatus, pendingGo, …) are answered from window.__GD, which the app puts in
   before the page's scripts run and keeps up to date; a stored photo is read from the app with a quick request; everything else is
   a message to the app, which answers through the same window.onXxx callbacks Android uses. */
(function () {
  if (window.Android) return;
  var G = window.__GD || {};
  window.__GD = G;
  window.GYMDAY_IOS = true;
  var post = function (m, a) { try { window.webkit.messageHandlers.gd.postMessage({ m: m, a: a || [] }); } catch (e) { } };
  var take = function (k) { var v = (G.pend && G.pend[k]) || ''; if (G.pend) G.pend[k] = ''; return v; };
  var photo = function (id) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', '/__photo/' + encodeURIComponent(id), false);
      x.send();
      return x.status === 200 ? x.responseText : '';
    } catch (e) { return ''; }
  };
  window.Android = {
    platform: function () { return 'ios'; },
    // the workout data and this phone's own sign-in notes
    load: function () { return G.data || ''; },
    save: function (json) { G.data = json; post('save', [json]); return true; },
    metaLoad: function () { return G.meta || ''; },
    metaSave: function (json) { G.meta = json; post('metaSave', [json]); return true; },
    // photos
    savePhoto: function (id, dataUrl) { post('savePhoto', [String(id), String(dataUrl)]); return true; },
    loadPhoto: function (id) { return photo(String(id)); },
    deletePhoto: function (id) { post('deletePhoto', [String(id)]); },
    sharedPhotos: function () { var s = G.shared || ''; G.shared = ''; if (s) post('sharedTaken'); return s || '[]'; },
    // Apple Health, in Health Connect's place
    hcStatus: function () { return JSON.stringify(G.hc || { sdk: 0, available: false, granted: false }); },
    hcRequest: function () { post('hcRequest'); },
    hcRead: function (key, s, e) { post('hcRead', [String(key), String(s), String(e)]); },
    hcDay: function (key, s, e) { post('hcDay', [String(key), String(s), String(e)]); },
    hcAutoAsk: function () { post('hcAutoAsk'); },
    hcOpen: function () { post('hcOpen'); },
    hcWeight: function (key) { post('hcWeight', [String(key)]); },
    hcWeightAsk: function () { post('hcWeightAsk'); },
    hcSessions: function (key, from, to) { post('hcSessions', [String(key), +from, +to]); },
    hcSessionsAsk: function () { post('hcSessionsAsk'); },
    hcWrite: function (key, json) { post('hcWrite', [String(key), String(json)]); },
    hcRemove: function (key, ids) { post('hcRemove', [String(key), String(ids)]); },
    hcWriteAsk: function () { post('hcWriteAsk'); },
    // what a link, a shortcut, a widget or Control Center asked for
    pendingGo: function () { return take('go'); },
    pendingStart: function () { return take('start'); },
    pendingJoin: function () { return take('join'); },
    // the running workout (a Live Activity on the Lock Screen)
    workoutCard: function (json) { post('workoutCard', [String(json)]); },
    workoutSaved: function (title, text) { post('workoutSaved', [String(title || ''), String(text || '')]); },
    workoutClear: function () { post('workoutClear'); },
    noteToast: function (msg) { if (window.toast) window.toast(msg); },
    capsuleState: function () { return G.live || 'na'; },
    capsuleOpen: function () { post('openSettings'); },
    // reminders
    notifAllowed: function () { return !!G.notif; },
    notifAsk: function () { post('notifAsk'); },
    notifOpen: function () { post('openSettings'); },
    stillAt: function (ms) { post('stillAt', [String(ms)]); },
    remindersSet: function (json) { post('remindersSet', [String(json)]); },
    suppRemindSet: function (json) { post('suppRemindSet', [String(json)]); },
    proteinNudgeSet: function (json) { post('proteinNudgeSet', [String(json)]); },
    // widgets, the morning brief and the evening wrap-up
    todayData: function (json) { post('todayData', [String(json)]); },
    foodWidgetData: function (json) { post('foodWidgetData', [String(json)]); },
    widgetData: function (json) { post('widgetData', [String(json)]); },
    // the phone
    themeBars: function (light) { post('themeBars', [!!light]); },
    fontScale: function () { return +G.font || 1; },
    voiceOk: function () { return !!G.voice; },
    voiceListen: function (lang, prompt) { post('voiceListen', [String(lang || 'en-IN'), String(prompt || '')]); },
    canLock: function () { return !!G.lock; },
    unlock: function () { post('unlock'); },
    share: function (text) { post('share', [String(text || '')]); },
    saveFile: function (name, mime, text) { post('saveFile', [String(name), String(mime), String(text)]); },
    shareFile: function (name, mime, text) { post('shareFile', [String(name), String(mime), String(text)]); return true; },
    shareImage: function (dataUrl, text) { post('shareImage', [String(dataUrl), String(text || '')]); return true; },
    exportBackup: function (json) { post('exportBackup', [String(json)]); },
    importBackup: function () { post('importBackup'); },
    keepAwake: function (on) { post('keepAwake', [!!on]); },
    scanBarcode: function (key) { post('scanBarcode', [String(key || '')]); },
    hideKeyboard: function () { try { var a = document.activeElement; if (a && a.blur) a.blur(); } catch (e) { } },
    vibrate: function (ms) { post('vibrate', [+ms || 20]); },
    openUrl: function (url) { post('openUrl', [String(url || '')]); }
  };
  // the app keeps these up to date while the page is open (an answer to "allow?", a photo shared, a shortcut used)
  window.__gdSet = function (k, v) { G[k] = v; };
  window.__gdPend = function (k, v) { if (!G.pend) G.pend = {}; G.pend[k] = v; };
  document.documentElement.classList.add('ios');
})();
