# web — AI Web Tester landing + docs

Astro 5 + Starlight + Tailwind, dark lab bench theme. Static output → deploy anywhere free.

## Dev
```bash
npm install
npm run dev   # http://localhost:4321
npm run build # → dist/
npm run preview
```

## Deploy (free)

**Cloudflare Pages** (recommended)
- Connect GitHub repo → Build command: `npm --prefix web run build` → Output: `web/dist`

**Vercel**
- Import repo → Framework: Astro → Root dir: `web` → Build: `npm run build`

**GitHub Pages**
- `astro.config.mjs` set `site` to `https://<user>.github.io/<repo>/` and add `base: '/<repo>/'` then `npm run build` → push `dist/` to `gh-pages`.

No env vars needed. All content is MDX in `src/content/docs/`.
