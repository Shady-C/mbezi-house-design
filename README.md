# Mbezi house design

A scaled floor plan, site plan and interactive 3D model of the Mbezi house, worked out from 68 photos.

**Live page:** https://shady-c.github.io/mbezi-house-design/

The page has four tabs:

- **Plan**: scaled floor plan and site plan
- **3D**: orbit view, roof-off dollhouse and first-person walk
- **Photos**: each photo pinned where it was taken
- **Edit sizes**: correct the estimated sizes; edits are saved in your browser and can be copied or downloaded as `house.json`

All room sizes are estimates from photos (about ±10–15 %). See [estimates.md](estimates.md) for how each size was worked out and [verification.md](verification.md) for the photo-by-photo check.

## Files

| File | What it is |
|---|---|
| `floor-plan.pdf` | Both plans plus the room-size table |
| `floor-plan.svg`, `site-plan.svg` | The plans as vector images |
| `house.glb` | 3D model (opens in Blender or SketchUp) |
| `renders/` | Six 1920×1080 views |
| `house.json` | The house description |
| `source/` | The code |

## Running locally

```bash
cd source
npm ci
npm test                      # unit tests
npm run smoke                 # browser tests (uses Chrome if installed, else Playwright's Chromium)
node tools/sync-web.mjs       # copy modules, data and three.js into web/
node tools/serve.mjs 4173     # then open http://localhost:4173
```

`node tools/export.mjs --out dist` regenerates the plans, PDF, 3D model and renders.

Pushing to `main` runs the unit and browser tests and deploys `source/web` to GitHub Pages.
