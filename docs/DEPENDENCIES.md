# Dependencies & External Services

Every runtime dependency and third-party service the app talks to, its license/terms, and what
that means for us. Update this file whenever a dependency or service is added, removed, or
upgraded across a license boundary (see the "Dependency Licensing" rule in `CLAUDE.md`).

## npm packages

| Package | Version | License | Notes |
|---|---|---|---|
| `maplibre-gl` | 6.8.0 | BSD-3-Clause | Permissive, OSI-approved. Free for production and commercial use, no attribution beyond the license notice. |
| `purify-ts` | 2.1.4 | ISC | Permissive, functionally equivalent to MIT. Free for production and commercial use. |
| `@emnapi/core` | 1.11.3 | MIT | Permissive. Free for production and commercial use. |
| `@emnapi/runtime` | 1.11.3 | MIT | Permissive. Free for production and commercial use. |
| `fflate` | 0.8.3 | MIT | Permissive. Free for production and commercial use. |
| `proj4` | 2.22.0 | MIT | Permissive. Free for production and commercial use. |
| `read-excel-file` | 9.3.10 | MIT | Permissive. Free for production and commercial use. |
| `shapefile` | 0.6.6 | BSD-3-Clause | Permissive. Free for production and commercial use. |
| `typescript` | 6.0.3 | Apache-2.0 | Permissive, includes an explicit patent grant. Free for production and commercial use. |
| `vite` | 8.1.0 | MIT | Permissive. Free for production and commercial use. |
| `vitest` | 4.1.11 | MIT | Permissive. Free for production and commercial use. |

All of the above are OSI-approved, permissive licenses with no copyleft, no field-of-use
restriction, and no fee. None require us to open-source our own code or pay for commercial use.

Regenerate this table's license column with:

```sh
node -pe "require('./node_modules/<pkg>/package.json').license"
```

## External services (network calls at runtime)

### Map tiles — OpenFreeMap
- **What:** Vector basemap tiles (style, sprites, glyphs) loaded by `maplibre-gl` from
  `tiles.openfreemap.org` (see `src/main.ts`).
- **Terms:** OpenFreeMap's own code/infra is MIT-licensed; the underlying map data is
  OpenStreetMap data under **ODbL**. The public instance has no rate limits, needs no API key,
  no registration, and explicitly permits production and commercial use. It is fully
  self-hostable if we ever need to stop depending on the public instance.
  Source: https://openfreemap.org
- **Obligation:** Attribution — "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (maplibre-gl
  surfaces this automatically via the style's built-in attribution control; don't disable
  `attributionControl` on the map).
- **Do not** point the map at `tile.openstreetmap.org` directly — OSMF's tile usage policy
  restricts that server to light testing/evaluation and it will throttle or silently drop
  requests from a deployed app (this is what broke tile loading in production before this
  change).

### Municipality boundaries — Lantmäteriet ("Kommun, län och rike")
- **What:** Pre-processed at build time by `scripts/generate-municipalities.mjs` into
  `public/municipalities.geojson`; bundled as a static asset, no runtime call to Lantmäteriet
  (`src/infrastructure/municipalities.ts` just fetches the local file, same pattern as
  `votingDistricts.ts`). Replaces both the original OpenDataSoft-sourced fetch (no declared
  license) and an intermediate OGC API Features approach (abandoned — see below).
- **Terms:** Governed by Lantmäteriet's *"Användningsvillkor för värdefulla datamängder"*
  (2025-02-01, DNR LM2025/009266 — full text at
  `docs/lantmateriet-anvandningsvillkor-vardefulla-datamangder.pdf`) — **CC BY 4.0**, not CC0. No
  fee, no legal review required. Free use, modification, and redistribution, including commercial
  use, **provided attribution is given**. Corrects an earlier assumption in this file that
  Lantmäteriet's open geodata is uniformly CC0 — true for some products, but the "värdefulla
  datamängder" (high-value datasets) terms that apply here require attribution.
- **Attribution requirement (CC BY 4.0):** state (1) the product name as data source, (2)
  "©Lantmäteriet", (3) whether the data has been processed, and (4) that CC BY 4.0 applies.
  Satisfied via the map's attribution control (`src/main.ts`):
  `"Administrativ indelning © Lantmäteriet, CC BY 4.0"` — the reprojection/format conversion in
  `scripts/generate-municipalities.mjs` counts as processing.
- **Source data:** Lantmäteriet's STAC catalog (`api.lantmateriet.se/stac-vektor/v1`, collection
  `kommun-lan-rike`) needs no auth to browse — only the actual GeoPackage *download*
  (`dl1.lantmateriet.se/...zip`) requires HTTP Basic auth. Filtered to Stockholm county
  (`lanskod = '01'`) to match the rest of the app; converted from GeoPackage/WKB
  (EPSG:3006/SWEREF99&nbsp;TM) to GeoJSON (WGS84) by the script, using a small hand-rolled WKB
  decoder — deliberately not the `@ngageoint/geopackage` npm package, which pulls in
  known-vulnerable transitive deps (`file-type`/`image-size`, for embedded raster tiles this
  dataset doesn't have) that `npm audit` flagged; see `CLAUDE.md`'s dependency-security rule.
- **Regenerating the data:** run `node --env-file=.env scripts/generate-municipalities.mjs` with
  `LANTMATERIET_USERNAME`/`LANTMATERIET_PASSWORD` set in `.env` (see `.env.example`). These are
  **build-time only, never `VITE_`-prefixed**, so they're never inlined into the client bundle —
  this was a deliberate design choice after we initially explored a live client-side API call
  (OGC API Features) that would have required a client-visible credential on every page load.
  ⚠️ Currently this is a personal Lantmäteriet account login, used as a stopgap because devportal
  access to get an Application-scoped Consumer Key/Secret is still blocked (open ticket with
  Lantmäteriet support) — swap this for a proper Application credential once that's resolved, and
  rotate the account password periodically in the meantime since it's sitting in a local `.env`.
- **Other terms to note:** Lantmäteriet may suspend access without notice for technical
  misuse/abuse (§4.1) or, without stating a reason, for information-security/personal-data/
  national-security concerns (§4.2) — no formal SLA. Terms can change unilaterally for minor
  updates; major changes require re-acceptance (§5). Low risk here since this is an occasional
  build-time regeneration, not live production traffic.

### Voting district results — Valmyndigheten (Swedish Election Authority)
- **What:** Pre-processed at build time into `public/voting-districts-*.geojson` (see comment in
  `src/infrastructure/votingDistricts.ts`); bundled as static assets, no runtime call to
  Valmyndigheten.
- **Terms:** Valmyndigheten publishes its open data as free to use, reuse, and share for any
  purpose, with no fee and no agreement required — the only condition is citing Valmyndigheten as
  the source. Source: https://www.val.se/valresultat-och-statistik/statistik-och-data/om-var-oppna-data
- **Obligation:** surfaced as a visible credit — "Election results: Valmyndigheten" — in the map's
  attribution control (`src/main.ts`), not just a source comment.
