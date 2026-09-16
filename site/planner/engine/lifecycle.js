/* Greenhse Layout Planner — mount/unmount bookkeeping.
   The engine was written for a page it owned outright: it hangs listeners on
   window and document and starts intervals, and never expected to be taken
   down. Inside a React app the component can unmount (client-side navigation
   away, StrictMode in development), so while the engine is mounting, every
   window/document listener and every interval it registers is recorded here
   and undone on unmount. Nothing in the engine itself had to change for it. */
export function begin(){
  const rec = { listeners: [], intervals: [], patched: [] };
  for (const target of [window, document]) {
    const add = target.addEventListener, remove = target.removeEventListener;
    target.addEventListener = function(type, fn, opts){
      rec.listeners.push([target, type, fn, opts]);
      return add.call(target, type, fn, opts);
    };
    rec.patched.push(() => { target.addEventListener = add; target.removeEventListener = remove; });
  }
  const si = window.setInterval;
  window.setInterval = function(fn, ms){ const id = si.call(window, fn, ms); rec.intervals.push(id); return id; };
  rec.patched.push(() => { window.setInterval = si; });
  return rec;
}
/* Stop recording (call as soon as the engine has mounted). The listeners and
   intervals already captured stay on the record for end(). */
export function settle(rec){
  rec.patched.forEach((undo) => undo());
  rec.patched = [];
}
export function end(rec){
  settle(rec);
  rec.listeners.forEach(([t, type, fn, opts]) => { try { t.removeEventListener(type, fn, opts); } catch (e) {} });
  rec.intervals.forEach((id) => clearInterval(id));
  rec.listeners = []; rec.intervals = [];
  for (const k of ['__GH', '__GHQA', '__GHTRACK', '__GHDRAFT', '__TUT']) { try { delete window[k]; } catch (e) {} }
}
