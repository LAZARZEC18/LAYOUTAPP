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

  /* Email to Lazar only (see emailSubmission). Non-fatal: a failed email
     never loses the stored plan. */
  try { await emailSubmission(req, id, meta, payload); } catch { /* best effort */ }

  return json({ ok: true, id });
};

/* Lazar, 22 Sep: the submission email must go ONLY to lazarzec@yahoo.com and
   must not touch any Greenhse mailbox. Greenhse's own mail script always
   copies its admin inbox and ignores the address it is given (test 3 proved
   it), so it is not used here at all. This posts to FormSubmit
   (formsubmit.co), a keyless relay that emails the address in the URL. The
   first submission makes FormSubmit send a one-time activation email to that
   address; once Lazar clicks "Activate", every later submission is delivered. */
const NOTIFY_EMAIL = 'lazarzec@yahoo.com';
const MAIL_ENDPOINT = 'https://formsubmit.co/ajax/' + NOTIFY_EMAIL;
const money = (v) => '$' + (Math.round((+v || 0) * 100) / 100).toLocaleString('en-AU',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const rooms = ((payload.project && payload.project.rooms) || []).length;
  const quote = lines.length
    ? lines.map((l) => (+l.qty || 0) + ' x ' + l.name + ' [' + l.code + '] @ ' + money(l.unitExGst) +
        ' = ' + money(l.lineExGst)).join('\n')
    : 'No fittings';

  const body = {
    _subject: 'Layout plan sent by ' + String(c.name || 'a customer').slice(0, 80) +
      (meta.project ? ' - ' + meta.project : '') + ' - ' + money(inc) + ' inc GST',
    _template: 'table',
    _captcha: 'false',
    'Customer': String(c.name || ''),
    'Email': String(c.email || '-'),
    'Phone': String(c.phone || '-'),
    'Suburb': String(c.suburb || '-'),
    'Job type': String(c.jobType || '-'),
    'Project': String(meta.project || '-'),
    'Sent': when + ' (Perth)',
    'Rooms / fittings': rooms + ' / ' + (+meta.fittings || 0),
    'Notes': String(c.notes || '-'),
    'Quote (ex GST)': quote,
    'Subtotal ex GST': money(ex),
    'GST 10%': money(gst),
    'TOTAL inc GST': money(inc),
    'View in layout admin': origin + '/layout-admin/?open=' + encodeURIComponent(id),
    'Open in planner (admin key needed)': origin + '/layout-app/?load=' + encodeURIComponent(id),
    'Note': 'Indicative only - catalogue rates, excludes cable, downlight kits and labour.',
  };
  const r = await fetch(MAIL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('mail ' + r.status);
}

export const config = { path: '/api/submit-layout' };
