# src/Admin/

`AdminMenu.php` registers the wp-admin page and enqueues the built bundle.
The rest of this folder is the admin UI — React + Vite + Tailwind v4:

| | |
| --- | --- |
| `main.tsx` | mounts on `<div id="{{rootId}}">` |
| `App.tsx` | the panel — REST-API hero, status pill, wiring cards |
| `logo.svg` | brand mark shown in the header (swap to rebrand — Vite hashes it into the bundle) |
| `lib/api.ts` | fetch wrapper (REST base + nonce from PHP) |
| `index.css` | scoped Tailwind preflight + palette tokens (doesn't touch wp-admin chrome) |
| `vite.config.ts`, `tsconfig.json` | build config |
| `dist/` | `vite build` output — `index.js` + `index.css` + hashed assets, git-ignored |

**Everything is driven from the project root** — one `package.json`, one
`npm install`. Build with `npm run build:app`.

`woocraft build` / `woocraft dev` package **only `AdminMenu.php` and
`dist/`** from here — the `.tsx` source and Vite config never reach the
shipped plugin.
