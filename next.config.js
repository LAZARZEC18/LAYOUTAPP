/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  // Static export: `next build` writes the finished app to out/ and Netlify
  // serves it from the CDN. The only server-side pieces are the four
  // functions in netlify/functions (layout submissions), which Netlify
  // deploys alongside.
  ...(isDev ? {} : { output: 'export' }),
  trailingSlash: true,
  images: { unoptimized: true },
};
module.exports = nextConfig;
