/* ============================================================
   /api/layouts — the admin side of layout submissions.
   Every request needs the admin key (ADMIN_KEY environment
   variable on the Netlify site), sent as an x-admin-key header
   or ?key= query parameter.

     GET  /api/layouts           → { plans: [meta, …] } newest first
     GET  /api/layouts?id=<id>   → the full stored submission
     DELETE /api/layouts?id=<id> → removes a submission

   The full submission's planData is byte-for-byte what the
   planner's Save button writes, so the admin page can hand it
   straight back to layout.html for editing.
   ============================================================ */
import { getStore } from '@netlify/blobs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default async (req) => {
  const url = new URL(req.url);
  const key = req.headers.get('x-admin-key') || url.searchParams.get('key');
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey) return json({ error: 'ADMIN_KEY is not configured on the site' }, 503);
  if (key !== adminKey) return json({ error: 'Unauthorised' }, 401);

  const store = getStore('layouts');
  const id = url.searchParams.get('id');
  const draftId = url.searchParams.get('draft');

  if (req.method === 'DELETE') {
    if (draftId) {
      await Promise.all([store.delete('drafts/' + draftId), store.delete('dmeta/' + draftId)]);
      return json({ ok: true });
    }
    if (!id) return json({ error: 'id required' }, 400);
    await Promise.all([store.delete('plans/' + id), store.delete('meta/' + id)]);
    return json({ ok: true });
  }

  if (req.method !== 'GET') return json({ error: 'GET or DELETE only' }, 405);

  if (draftId) {
    const d = await store.get('drafts/' + draftId, { type: 'json' });
    if (!d) return json({ error: 'Not found' }, 404);
    return json({ planData: d.planData || null, project: d.project || null });
  }

  if (id) {
    const plan = await store.get('plans/' + id, { type: 'json' });
    if (!plan) return json({ error: 'Not found' }, 404);
    /* ?fields=edit returns just the editable plan - the planner's ?load=
       doesn't need the marked-up plan image, which is most of the payload
       and most of the wait. */
    if (url.searchParams.get('fields') === 'edit') {
      return json({ planData: plan.planData || null, project: plan.project || null });
    }
    return json(plan);
  }

  const { blobs } = await store.list({ prefix: 'meta/' });
  const metas = await Promise.all(
    blobs.map((b) => store.get(b.key, { type: 'json' }).catch(() => null))
  );
  const plans = metas
    .filter(Boolean)
    .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));

  /* In-progress drafts ride along. Anything untouched for 14 days is
     pruned — an abandoned half-plan is noise, not a lead. */
  const dl = await store.list({ prefix: 'dmeta/' });
  const dms = await Promise.all(
    dl.blobs.map((b) => store.get(b.key, { type: 'json' }).catch(() => null))
  );
  const cutoff = Date.now() - 14 * 86400000;
  const drafts = [], stale = [];
  for (const m of dms.filter(Boolean)) {
    (Date.parse(m.updatedAt || 0) < cutoff ? stale : drafts).push(m);
  }
  if (stale.length) {
    await Promise.all(stale.flatMap((m) =>
      [store.delete('drafts/' + m.sid), store.delete('dmeta/' + m.sid)]
    )).catch(() => {});
  }
  drafts.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return json({ plans, drafts });
};

export const config = { path: '/api/layouts' };
