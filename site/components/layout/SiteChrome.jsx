'use client';
/* Wraps the parts of the root layout that are the SITE — header, footer,
   overlays — so a route that owns the whole window (the layout planner) can
   opt out of them. The planner pins itself over the viewport and hides the
   rest in print anyway, so this is belt and braces: without it the planner
   still works, it just carries an invisible site header underneath. */
import { usePathname } from 'next/navigation';

const FULLSCREEN = [/^\/layout-app\/?$/, /^\/layout-admin\/?$/];

export default function SiteChrome({ children }) {
  const pathname = usePathname() || '';
  if (FULLSCREEN.some((rx) => rx.test(pathname))) return null;
  return children;
}
