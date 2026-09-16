import './_styles/fonts.css';

/* Root layout for the standalone layout-app repo. It only sets up the two
   fonts and the document; the planner and admin pages own the whole window
   themselves (planner.css / admin.css are scoped and imported by the
   components). When these files are merged into the main greenhse site,
   the site's own app/layout.js is used instead — see README. */
export const metadata = {
  title: 'Layout Planner — Greenhse Technologies',
  description:
    'Plan your lighting on your own floor plan. Load a plan, set the scale, drop Greenhse fittings room by room and get a costed light schedule for your electrician.',
  icons: { icon: [{ url: '/favicon.png', type: 'image/png' }] },
  robots: { index: false, follow: false },
};
export const viewport = { themeColor: '#f4f2ec' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
