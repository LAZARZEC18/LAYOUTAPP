import LayoutAdmin from '../../site/planner/admin/LayoutAdmin';

/* Staff-only: the layout submissions review page. Guarded by the admin key
   (ADMIN_KEY on the Netlify site); nothing shows without it. */
export const metadata = {
  title: 'Layout submissions — Greenhse (staff)',
  robots: { index: false, follow: false },
};

export default function LayoutAdminPage() {
  return <LayoutAdmin />;
}
