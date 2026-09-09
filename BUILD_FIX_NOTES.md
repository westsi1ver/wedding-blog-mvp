# Build fix notes

This version hardens the Render/Docker production build:

- Removed runtime dependency on `@/lib/*` aliases from app imports; uses relative imports.
- Fixed Cheerio generic reassignment issue in `lib/naver.ts`.
- Replaced Map/Set iterator spread expressions with `Array.from(...)` in compiler-sensitive spots.
- Set TypeScript target to ES2017 and enabled `downlevelIteration`.
- Docker now installs devDependencies during the build (`typescript`, React types) and only sets `NODE_ENV=production` after `next build`.
- `layout.tsx` imports `ReactNode` explicitly.
- Kept Playwright image/version aligned with `playwright@1.55.0`.

Before pushing:

```bash
npm install
npm run build
```

Then:

```bash
git add .
git commit -m "fix production build"
git push
```
