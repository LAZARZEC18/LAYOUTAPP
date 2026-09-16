import Link from 'next/link';

/* Index of the standalone repo: the two routes it contains. On the real site
   the planner is reached from the site's own navigation. */
export const metadata = { title: 'Greenhse Layout App' };

export default function Home() {
  return (
    <main style={{ fontFamily: 'Poppins, sans-serif', maxWidth: 560, margin: '80px auto', padding: '0 24px', color: '#14150f', lineHeight: 1.5 }}>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: '#00a800' }}>Greenhse Technologies</p>
      <h1 style={{ fontSize: 28, margin: '8px 0 20px' }}>Layout app</h1>
      <p><Link href="/layout-app/" style={{ color: '#00a800' }}>/layout-app/</Link> — the layout planner customers use.</p>
      <p><Link href="/layout-admin/" style={{ color: '#00a800' }}>/layout-admin/</Link> — staff view of submitted plans (needs the admin key).</p>
    </main>
  );
}
