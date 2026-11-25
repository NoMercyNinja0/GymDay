/* GymDay 1.33 · the watch switch (watch.js).
   Not everybody wears a smartwatch or a band. D.settings.noWatch === true (synced with the account) means "I don't have one":
   everything that reads from a watch is then hidden and paused, so none of it is in the way:
     · Sleep from your watch (the sheet, its card on Today) and the automatic morning sync (sleepwatch.js, hcauto.js);
     · Settings → Watch & Google Health, and with it the workouts' heart rate and calories from Health Connect (health.js);
     · "Forgot to log? Ask my watch" (missed.js);
     · the watch's screenshots: after a workout, for an activity, for a whole day, for a night (calories.js, sports.js, progress.js);
     · resting heart rate, HRV, blood oxygen and breathing: their tiles and charts, their lanes on Insights and the heart part of
       readiness (progress.js gives no heart numbers while the switch is off, so every screen that shows them goes quiet).
   Sleep stays, typed by hand; so do activities and calories (typed or worked out). Nothing that was logged is deleted: switch the
   watch back on and every number is where it was.
   Where it is set: Settings (the Watch card), the last card of the short tour on a new phone (insights.js) and "I don't have a
   watch" on the Sleep from your watch sheet (sleepwatch.js). Every module asks Watch.on(). */
(function () {
  'use strict';
  const A = window.App, S = window.Store;
  if (!A || !S) return;
  const { ACT } = A, D = S.data;
  const on = () => D.settings.noWatch !== true;
  const answered = () => D.settings.noWatch === true || D.settings.noWatch === false;
  /** have: true = wears a watch. `quiet` leaves the toast out (the caller says it in its own words). */
  function set(have, quiet) {
    D.settings.noWatch = !have; S.save(true); A.rerender();
    if (!quiet) window.toast(have ? 'Watch features are back' : 'Watch features are hidden. Settings brings them back.');
  }
  // the card on Settings: one switch, and in a line what off does
  function settingsCard() {
    const K = window.SetKit, w = on();
    return `<div class="card set-card" id="setWatch"><h3>Watch</h3>
      <div class="row">${K ? K.tile('watch') : ''}<div class="grow">I have a smartwatch or band<div class="xs dim">${w ? 'Off = everything that needs a watch is hidden' : 'Off: sleep from a watch, Health Connect, watch screenshots and heart-rate numbers are hidden and paused. Nothing you logged is deleted.'}</div></div>
      <input type="checkbox" data-bind="optWatch" ${w ? 'checked' : ''} aria-label="I have a smartwatch or band" style="width:22px;height:22px"></div></div>`;
  }
  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.bind === 'optWatch') set(t.checked); });
  // "I don't have a watch" on the Sleep from your watch sheet: hidden at once, with a way back
  ACT.watchNone = () => {
    A.closeSheet(); set(false, true);
    if (window.Motion && window.Motion.undoToast) window.Motion.undoToast('Watch features are hidden', () => set(true, true)); else window.toast('Watch features are hidden. Settings brings them back.');
  };
  ACT.watchSet = el => set(!!el && el.dataset.v === '1');
  window.Watch = { on, set, answered, settingsCard };
})();
