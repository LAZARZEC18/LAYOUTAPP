import LayoutPlanner from '../../site/planner/LayoutPlanner';

/* The layout planner lives at /layout-app/. It used to be a plain HTML file
   copied into the export at build time; it is a React route now. */
export const metadata = {
  title: 'Layout Planner — Greenhse Technologies',
  description:
    'Plan your lighting on your own floor plan. Load a plan, set the scale, drop Greenhse fittings room by room and get a costed light schedule for your electrician.',
  robots: { index: false, follow: false },
};

export default function LayoutAppPage() {
  return <LayoutPlanner />;
}
