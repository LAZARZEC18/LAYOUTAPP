/* ============================================================
   /api/track — anonymous layout-app usage.

   POST (public): the planner's usage beacon. Body:
     { uid, sid, events: [{e, t, d?}] }
   uid = anonymous per-browser id, sid = per-visit id. No names,
   no plan content — just which actions happened. Stored in the
   "usage" Blobs store, one blob per day: days/<yyyy-mm-dd> =
   { sessions: { sid: { uid, first, last, events:{name:count},
   f (max lights placed), r (max rooms) } } }.
   Low traffic, so read-merge-write per batch is fine; a lost
   update under concurrency costs one beacon, not a plan.

   GET (staff, ADMIN_KEY): aggregates for the admin dashboard —
   last 30 days of {date, sessions, visitors, sent, pdf} plus the
   25 most recent sessions.
   ============================================================ */
import { getStore } from '@netlify/blobs';

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const store = getStore('usage');

  if (req.method === 'POST') {
    let p;
    try { p = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    const sid = String(p.sid || '').slice(0, 40);
    const uid = String(p.uid || '').slice(0, 40);
    const events = Array.isArray(p.events) ? p.events.slice(0, 60) : [];
    if (!sid || !events.length) return json({ ok: true });

    const key = 'days/' + new Date().toISOString().slice(0, 10);
    const cur = (await store.get(key, { type: 'json' })) || { sessions: {} };
    if (Object.keys(cur.sessions).length > 2000) return json({ ok: true }); // day cap
    const s = cur.sessions[sid] || (cur.sessions[sid] = { uid, first: Date.now(), events: {} });
    s.last = Date.now();
    for (const ev of events) {
      const name = String((ev && ev.e) || '').slice(0, 24);
      if (!name) continue;
      s.events[name] = (s.events[name] || 0) + 1;
      if (name === 'state' && ev.d) {
        s.f = Math.max(s.f || 0, +ev.d.f || 0);
        s.r = Math.max(s.r || 0, +ev.d.r || 0);
      }
    }
    await store.setJSON(key, cur);
    return json({ ok: true });
  }

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const k = req.headers.get('x-admin-key') || url.searchParams.get('key');
    if (!process.env.ADMIN_KEY) return json({ error: 'ADMIN_KEY is not configured on the site' }, 503);
    if (k !== process.env.ADMIN_KEY) return json({ error: 'Unauthorised' }, 401);

    const { blobs } = await store.list({ prefix: 'days/' });
    const keys = blobs.map((b) => b.key).sort().slice(-30);
    const days = [], recent = [];
    for (const key of keys) {
      const d = await store.get(key, { type: 'json' }).catch(() => null);
      if (!d) continue;
      const sess = Object.entries(d.sessions || {});
      days.push({
        date: key.slice(5),
        sessions: sess.length,
        visitors: new Set(sess.map(([, v]) => v.uid || '')).size,
        sent: sess.filter(([, v]) => v.events && v.events.sent).length,
        pdf: sess.reduce((a, [, v]) => a + ((v.events && v.events.pdf) || 0), 0),
      });
      for (const [sid, v] of sess) {
        recent.push({ date: key.slice(5), sid, last: v.last || v.first, f: v.f || 0, r: v.r || 0, events: v.events || {} });
      }
    }
    recent.sort((a, b) => (b.last || 0) - (a.last || 0));
    return json({ days, recent: recent.slice(0, 25) });
  }

  return json({ error: 'POST or GET only' }, 405);
};

export const config = { path: '/api/track' };
