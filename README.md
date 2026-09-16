# Greenhse Layout App

The lighting layout planner and its staff admin page, on their own. Next.js 14
(App Router, static export), React 18, four Netlify functions for storing the
plans customers submit. No HTML pages — everything is React.

## Run it

```
npm install
npm run dev        # http://localhost:3000/layout-app/
npm run build      # writes the static site to out/
```

The `/api/*` endpoints are Netlify functions, so they only work on Netlify
(or with `netlify dev`). Without them the planner still runs fully — only
Save/Submit and the admin page need the backend.

## Deploy on Netlify

1. New site from this repo. `netlify.toml` already sets the build command
   (`npm run build`), the publish folder (`out`) and the functions folder.
2. Site configuration → Environment variables → add `ADMIN_KEY` (any long
   secret). The admin page and the tracking endpoint refuse everything
   without it.
3. Deploy. Netlify Blobs needs no setup — the functions create the stores.

Routes: `/layout-app/` (the planner) and `/layout-admin/` (staff, asks for the
admin key). `/layout-app/?qa=1` runs the planner's built-in test suite.

## What is where

| Path | What |
|---|---|
| `app/layout-app/page.js` | the planner route |
| `app/layout-admin/page.js` | the admin route |
| `site/planner/LayoutPlanner.jsx` | planner component (JSX shell + `planner.css`) |
| `site/planner/engine/` | the planner's logic: `core.js` (canvas, rooms, fittings, schedule, export), `home.js` (start screen, tutorial, save/submit), `qa.js` (`?qa=1` suite), `track.js` (usage pings), `lifecycle.js` (mount/unmount bookkeeping) |
| `site/planner/data/` | `products.js` (the fittings the planner offers), `art.js` (drawings/icons) |
| `site/planner/admin/` | `LayoutAdmin.jsx`, `admin.js`, `admin.css` |
| `netlify/functions/` | `submit-layout.mjs` (POST /api/submit-layout), `layouts.mjs` (GET/DELETE /api/layouts, admin key), `draft.mjs` (POST /api/draft), `track.mjs` (POST /api/track) |
| `public/img/` | product photos the planner shows (referenced from `products.js`) |
| `public/fonts/`, `app/_styles/fonts.css` | Poppins and JetBrains Mono |
| `site/components/layout/SiteChrome.jsx` | only needed when merged into the main site (below) |

## Merging into the main greenhse site

Copy these across unchanged, keeping the same paths:

- `site/planner/` (whole folder)
- `app/layout-app/`, `app/layout-admin/`
- `netlify/functions/`
- `public/img/` (add to the site's existing `public/img/`)
- `site/components/layout/SiteChrome.jsx`

Then in the site's `app/layout.js` wrap the header and the footer/overlays in
`<SiteChrome>…</SiteChrome>` so they step aside on the two planner routes,
add the `[functions]` block from `netlify.toml` to the site's own
`netlify.toml`, add `@netlify/blobs` to the site's `package.json`, and set
`ADMIN_KEY` on the site. The fonts and `app/layout.js` / `app/page.js` in this
repo are only for running it standalone — the main site already has its own.
