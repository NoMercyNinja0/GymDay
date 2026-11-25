/* GymDay 1.35.2 – after the big real-user test: a few things that cross several screens.
   (1) A new day while GymDay was left open: at midnight, or the next time it is looked at (the phone woken, the app brought
       back), Today and Food move on to the new day. Before, Today kept yesterday's date and greeting, and Food stayed on
       yesterday, so breakfast went into the wrong day. A page is never redrawn under a finger: with a sheet open or a box
       being typed in, it waits for the next check. */
(function () {
  'use strict';
  const A = window.App, S = window.Store;
  if (!A || !S) return;
  const dayKey = () => new Date().toDateString();
  let was = dayKey(), pending = false;
  function busy() {
    const sh = document.getElementById('sheet'), a = document.activeElement;
    return (sh && !sh.classList.contains('hidden')) || (!!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || !!document.getElementById('aiAsk');
  }
  function check() {
    const now = dayKey();
    if (now !== was) { was = now; pending = true; if (window.Calories && window.Calories.rollDay) window.Calories.rollDay(); }
    if (!pending || document.hidden) return;
    const top = A.top && A.top(); if (!top) return;
    if (!['days', 'calories', 'history'].includes(top.name)) { pending = false; return; }      // other pages draw the day when opened
    if (busy()) return;
    pending = false; A.rerender();
  }
  setInterval(check, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 150); });
  const r0 = window.appResume; window.appResume = () => { if (r0) r0(); setTimeout(check, 200); };
  window.Tidy = { check, _set: d => { was = d; } };          // _set: tests pretend the app was opened on another day
})();
