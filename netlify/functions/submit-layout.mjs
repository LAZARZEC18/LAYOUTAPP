/* ============================================================
   POST /api/submit-layout — receives a finished customer layout
   from the planner's Send button and stores it in Netlify Blobs.

   Two blobs per submission:
     plans/<id> — the full payload (customer, schedule, plan image,
                  and planData: the same editable plan the Save
                  button writes, so we can reopen and edit it)
     meta/<id>  — a small summary + thumbnail, so the admin list
                  loads fast without pulling every full plan.

   Public endpoint (customers post here); the read side
   (/api/layouts) is what carries the admin key.
   ============================================================ */
import { getStore } from '@netlify/blobs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  const c = payload && payload.customer;
  if (!c || !c.name || !(c.email || c.phone)) {
    return json({ error: 'A name and an email or phone number are required' }, 400);
  }

  /* Sortable id: newest submissions sort last by key, and the id
     doubles as a human-readable received-at stamp. */
  const id =
    new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) +
    '-' + Math.random().toString(36).slice(2, 8);

  const meta = {
    id,
    submittedAt: payload.submittedAt || new Date().toISOString(),
    name: String(c.name).slice(0, 120),
    email: String(c.email || '').slice(0, 160),
    phone: String(c.phone || '').slice(0, 40),
    suburb: String(c.suburb || '').slice(0, 80),
    jobType: String(c.jobType || '').slice(0, 40),
    project: String((payload.project && payload.project.name) || '').slice(0, 120),
    fittings: (payload.schedule && payload.schedule.fittings) || 0,
    totalIncGst: (payload.schedule && payload.schedule.totalIncGst) || 0,
    hasPlanData: !!payload.planData,
    thumb: typeof payload.thumb === 'string' && payload.thumb.startsWith('data:image/')
      ? payload.thumb : null,
  };
  delete payload.thumb; // lives in meta; no point storing it twice

  const store = getStore('layouts');
  await store.setJSON('plans/' + id, payload);
  await store.setJSON('meta/' + id, meta);

  /* Send = completed: the session's in-progress draft comes down and the
     submission (green in the admin) takes its place. */
  const sid = String(payload.sid || '').replace(/[^\w-]/g, '').slice(0, 60);
  if (sid) {
    try { await Promise.all([store.delete('drafts/' + sid), store.delete('dmeta/' + sid)]); }
    catch { /* best effort */ }
  }

  /* Email notification, via Netlify Forms: post a "plan-submission" form entry
     on our own site. Netlify's form notification (configured once in the UI:
     Forms → plan-submission → Notifications → add email) then emails the team
     with the customer's details and direct links to the plan. Non-fatal — a
     failed notification never loses the stored plan. */
  try {
    const origin = new URL(req.url).origin;
    const body = new URLSearchParams({
      'form-name': 'plan-submission',
      name: meta.name,
      email: meta.email,
      phone: meta.phone,
      suburb: meta.suburb,
      project: meta.project,
      fittings: String(meta.fittings),
      total_inc_gst: '$' + (+meta.totalIncGst || 0).toFixed(2),
      view_in_admin: origin + '/layout-admin/?open=' + id,
      open_in_planner: origin + '/layout-app/?load=' + id,
    });
    await fetch(origin + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch { /* notification is best-effort */ }

  return json({ ok: true, id });
};

export const config = { path: '/api/submit-layout' };
