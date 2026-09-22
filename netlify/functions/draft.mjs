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

  /* First draft for this session = a NEW PLAN HAS STARTED. Email the team
     once (Lazar, 22 Sep: "whenever a new plan starts it sends us an email").
     Later drafts from the same session update the blob quietly. The email
     goes through Greenhse's own mail endpoint - the same one the contact
     form and strip-light quote requests use - so it lands in the same inbox.
     Non-fatal: a failed email never loses the draft. */
  let isNew = false;
  try { isNew = !(await store.get('dmeta/' + sid)); } catch { isNew = true; }

  await store.setJSON('drafts/' + sid, { planData: p.planData, project: meta.project });
  await store.setJSON('dmeta/' + sid, meta);

  if (isNew) {
    try { await notifyPlanStarted(req, meta); } catch { /* best effort */ }
  }
  return json({ ok: true });
};

const MAIL_ENDPOINT = 'https://www.getestimate.greenhse.com/api/smtp-email-test.php';

async function notifyPlanStarted(req, meta) {
  const origin = new URL(req.url).origin;
  const when = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Perth', weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const adminUrl = origin + '/layout-admin/';
  const openUrl = origin + '/layout-app/?draft=' + encodeURIComponent(meta.sid);
  const html =
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#14150f">' +
    '<p style="font-size:16px;margin:0 0 12px"><strong>Someone has started a new plan in the Lighting Layout App.</strong></p>' +
    '<p style="margin:0 0 4px"><strong>When:</strong> ' + esc(when) + ' (Perth)</p>' +
    '<p style="margin:0 0 4px"><strong>Project name:</strong> ' + (esc(meta.project) || '<em>not named yet</em>') + '</p>' +
    '<p style="margin:0 0 4px"><strong>So far:</strong> ' + meta.rooms + ' room' + (meta.rooms === 1 ? '' : 's') +
    ', ' + meta.fittings + ' fitting' + (meta.fittings === 1 ? '' : 's') + '</p>' +
    '<p style="margin:0 0 14px"><strong>Session:</strong> ' + esc(meta.sid) + '</p>' +
    '<p style="margin:14px 0 4px"><a href="' + adminUrl + '" style="color:#00a800">Watch it in the layout admin</a></p>' +
    '<p style="margin:0 0 14px"><a href="' + openUrl + '" style="color:#00a800">Open the draft in the planner</a> (admin key needed)</p>' +
    '<p style="color:#666;font-size:12px;margin:0">No contact details exist yet - they arrive when the customer presses Send to Greenhse, ' +
    'which sends a second email with the full plan and quote.</p>' +
    '</div>';

  const fd = new FormData();
  fd.append('submit', 'true');
  fd.append('admin', 'true');
  fd.append('name', 'Lighting Layout App');
  fd.append('email', 'noreply@greenhse.com');
  fd.append('phone', '');
  fd.append('subject', 'New layout plan started' + (meta.project ? ': ' + meta.project : '') + ' - ' + when);
  fd.append('message', html);
  fd.append('env', 'true');
  const r = await fetch(MAIL_ENDPOINT, { method: 'POST', headers: { Accept: 'application/json' }, body: fd });
  if (!r.ok) throw new Error('mail ' + r.status);
}

export const config = { path: '/api/draft' };
