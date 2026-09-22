/* ============================================================
   POST /api/draft — live plan drafts.

   While a customer works on a real plan, the planner pushes a
   snapshot here whenever something changes (throttled, ~20 s),
   so the team can see plans IN PROGRESS in layout-admin before
   the customer ever hits Send. "Send to Greenhse" remains the
   completed signal — submit-layout deletes the session's draft
   and the submission takes its place.

   Two blobs per draft, keyed by the visit's anonymous session id:
     drafts/<sid> — { planData, project }  (openable in the planner)
     dmeta/<sid>  — small summary + thumbnail for the admin list

   Drafts carry NO contact details (none exist yet). The admin
   list hides and prunes drafts older than 14 days.
   ============================================================ */
import { getStore } from '@netlify/blobs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let p;
  try { p = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }

  const sid = String(p.sid || '').replace(/[^\w-]/g, '').slice(0, 60);
  if (!sid || !p.planData) return json({ error: 'sid and planData required' }, 400);

  const meta = {
    sid,
    updatedAt: new Date().toISOString(),
    project: String(p.project || '').slice(0, 120),
    fittings: +p.fittings || 0,
    rooms: +p.rooms || 0,
    thumb: typeof p.thumb === 'string' && p.thumb.startsWith('data:image/') ? p.thumb : null,
  };

  const store = getStore('layouts');
  await store.setJSON('drafts/' + sid, { planData: p.planData, project: meta.project });
  await store.setJSON('dmeta/' + sid, meta);
  return json({ ok: true });
};

export const config = { path: '/api/draft' };
