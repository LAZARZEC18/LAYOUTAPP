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

  /* Direct email too, through Greenhse's own mail endpoint (the contact form
     and strip-light quote requests use the same one), with the customer's
     details and the full quote - so the team gets it whether or not the
     Netlify Forms notification above is configured. Non-fatal. */
  try { await emailSubmission(req, id, meta, payload); } catch { /* best effort */ }

  return json({ ok: true, id });
};

const MAIL_ENDPOINT = 'https://www.getestimate.greenhse.com/api/smtp-email-test.php';
const money = (v) => '$' + (Math.round((+v || 0) * 100) / 100).toLocaleString('en-AU',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function emailSubmission(req, id, meta, payload) {
  const origin = new URL(req.url).origin;
  const c = payload.customer || {};
  const sch = payload.schedule || {};
  const lines = Array.isArray(sch.lines) ? sch.lines : [];
  const ex = +sch.totalExGst || lines.reduce((a, l) => a + (+l.lineExGst || 0), 0);
  const inc = +sch.totalIncGst || Math.round(ex * 1.1 * 100) / 100;
  const gst = Math.round((inc - ex) * 100) / 100;
  const when = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Perth', weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
  const td = 'padding:7px 10px;border-bottom:1px solid #e6e6e0;font-size:13px;vertical-align:top';
  const th = 'padding:7px 10px;border-bottom:2px solid #14150f;font-size:11px;text-transform:uppercase;letter-spacing:.06em;text-align:left;color:#555';
  const rows = lines.map((l) =>
    '<tr><td style="' + td + '">' + esc(l.name) + '<br><span style="color:#777;font-size:11px">' + esc(l.code) + '</span></td>' +
    '<td style="' + td + ';text-align:right">' + (+l.qty || 0) + '</td>' +
    '<td style="' + td + ';text-align:right">' + money(l.unitExGst) + '</td>' +
    '<td style="' + td + ';text-align:right">' + money(l.lineExGst) + '</td></tr>').join('');
  const rooms = ((payload.project && payload.project.rooms) || []).length;
  const html =
    '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#14150f;max-width:640px">' +
    '<p style="font-size:16px;margin:0 0 14px"><strong>A customer has sent a plan from the Lighting Layout App.</strong></p>' +
    '<table style="border-collapse:collapse;margin:0 0 16px">' +
    '<tr><td style="padding:2px 12px 2px 0;color:#555">Name</td><td><strong>' + esc(c.name) + '</strong></td></tr>' +
    '<tr><td style="padding:2px 12px 2px 0;color:#555">Email</td><td>' + (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '-') + '</td></tr>' +
    '<tr><td style="padding:2px 12px 2px 0;color:#555">Phone</td><td>' + (c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '-') + '</td></tr>' +
    '<tr><td style="padding:2px 12px 2px 0;color:#555">Suburb</td><td>' + (esc(c.suburb) || '-') + '</td></tr>' +
    '<tr><td style="padding:2px 12px 2px 0;color:#555">Job type</td><td>' + (esc(c.jobType) || '-') + '</td></tr>' +
    '<tr><td style="padding:2px 12px 2px 0;color:#555">Project</td><td>' + (esc(meta.project) || '-') + '</td></tr>' +
    '<tr><td style="padding:2px 12px 2px 0;color:#555">Sent</td><td>' + esc(when) + ' (Perth)</td></tr>' +
    '<tr><td style="padding:2px 12px 2px 0;color:#555">Rooms / fittings</td><td>' + rooms + ' / ' + (+meta.fittings || 0) + '</td></tr>' +
    '</table>' +
    (c.notes ? '<p style="margin:0 0 16px"><strong>Notes:</strong> ' + esc(c.notes) + '</p>' : '') +
    '<h3 style="font-size:14px;margin:0 0 6px">Quote</h3>' +
    '<table style="border-collapse:collapse;width:100%;margin:0 0 6px">' +
    '<thead><tr><th style="' + th + '">Item</th><th style="' + th + ';text-align:right">Qty</th>' +
    '<th style="' + th + ';text-align:right">Unit ex GST</th><th style="' + th + ';text-align:right">Line ex GST</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="4" style="' + td + '">No fittings</td></tr>') + '</tbody>' +
    '<tfoot>' +
    '<tr><td colspan="3" style="padding:6px 10px;text-align:right;color:#555">Subtotal ex GST</td><td style="padding:6px 10px;text-align:right">' + money(ex) + '</td></tr>' +
    '<tr><td colspan="3" style="padding:2px 10px;text-align:right;color:#555">GST 10%</td><td style="padding:2px 10px;text-align:right">' + money(gst) + '</td></tr>' +
    '<tr><td colspan="3" style="padding:8px 10px;text-align:right;font-weight:bold;border-top:2px solid #14150f">Total inc GST</td>' +
    '<td style="padding:8px 10px;text-align:right;font-weight:bold;border-top:2px solid #14150f;font-size:15px">' + money(inc) + '</td></tr>' +
    '</tfoot></table>' +
    '<p style="color:#666;font-size:11px;margin:0 0 16px">Indicative only - catalogue rates, excludes cable, downlight kits and labour.</p>' +
    '<p style="margin:0 0 4px"><a href="' + origin + '/layout-admin/?open=' + encodeURIComponent(id) + '" style="color:#00a800">View in the layout admin</a></p>' +
    '<p style="margin:0"><a href="' + origin + '/layout-app/?load=' + encodeURIComponent(id) + '" style="color:#00a800">Open the plan in the planner</a> (admin key needed)</p>' +
    '</div>';

  const fd = new FormData();
  fd.append('submit', 'true');
  fd.append('admin', 'true');
  /* Sender fields stay ours: the endpoint may copy the "email" address in,
     and this message carries admin links. The customer's details are in the
     body. */
  fd.append('name', 'Lighting Layout App');
  fd.append('email', 'noreply@greenhse.com');
  fd.append('phone', '');
  fd.append('subject', 'Layout plan sent by ' + String(c.name || 'a customer').slice(0, 80) +
    (meta.project ? ' - ' + meta.project : '') + ' - ' + money(inc) + ' inc GST');
  fd.append('message', html);
  fd.append('env', 'true');
  const r = await fetch(MAIL_ENDPOINT, { method: 'POST', headers: { Accept: 'application/json' }, body: fd });
  if (!r.ok) throw new Error('mail ' + r.status);
}

export const config = { path: '/api/submit-layout' };
