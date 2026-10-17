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
| `minotor` | 11.5.0 | MIT | Permissive. Dev-only — transit routing (RAPTOR) used by `scripts/buildTravelTimes.ts` to precompute travel times; never shipped to the browser. All of its runtime dependencies are MIT, ISC, Apache-2.0 or BSD-3-Clause. ⚠️ Known moderate advisory, accepted — see below. |
| `jsdom` | 29.1.1 | MIT | Permissive. Dev-only — DOM environment for unit-testing `src/interface/` rendering logic. |
| `proj4` | 2.22.0 | MIT | Permissive. Free for production and commercial use. |
| `read-excel-file` | 9.3.10 | MIT | Permissive. Free for production and commercial use. |
| `shapefile` | 0.6.6 | BSD-3-Clause | Permissive. Free for production and commercial use. |
| `typescript` | 6.0.3 | Apache-2.0 | Permissive, includes an explicit patent grant. Free for production and commercial use. |
| `vite` | 8.1.0 | MIT | Permissive. Free for production and commercial use. |
| `vitest` | 4.1.11 | MIT | Permissive. Free for production and commercial use. |

### Accepted advisory: `minotor` bundles a vulnerable `csv-parse`

`npm audit` reports [GHSA-8cw4-87c7-c6xx](https://github.com/advisories/GHSA-8cw4-87c7-c6xx)
(moderate) — prototype pollution through crafted CSV column names in `csv-parse` < 7.0.2.
`minotor` 11.5.0 bundles csv-parse 6.x into its own build and reads GTFS files with the affected
`columns: true` option, so an npm `overrides` entry cannot patch it.

Accepted (decided with Olivia, 2026-10-17) because:
- it is a devDependency, run only by the build script on a developer machine — none of the
  CSV-parsing code reaches the browser bundle;
- the only CSV it ever parses is Samtrafiken's official GTFS feed, downloaded over HTTPS —
  exploiting it would require malicious column names in that feed.

Upgrade `minotor` as soon as a release bundles csv-parse ≥ 7.0.2, then remove this note.

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
  `public/municipalities.geojson`; bundled as a static asset. `src/infrastructure/municipalities.ts`
  fetches the local file, same pattern as `votingDistricts.ts` — no runtime call to Lantmäteriet.
- **Terms:** Governed by Lantmäteriet's *"Användningsvillkor för värdefulla datamängder"*
  (2025-02-01, DNR LM2025/009266 — full text at
  `docs/lantmateriet-anvandningsvillkor-vardefulla-datamangder.pdf`) — **CC BY 4.0**. Free use,
  modification, and redistribution, including commercial use, **provided attribution is given**.
- **Attribution requirement (CC BY 4.0):** state (1) the product name as data source, (2)
  "©Lantmäteriet", (3) whether the data has been processed, and (4) that CC BY 4.0 applies.
  Satisfied via the map's attribution control (`src/main.ts`):
  `"Administrativ indelning © Lantmäteriet, CC BY 4.0"` — the reprojection/format conversion in
  `scripts/generate-municipalities.mjs` counts as processing.
- **Source data:** Lantmäteriet's STAC catalog (`api.lantmateriet.se/stac-vektor/v1`, collection
  `kommun-lan-rike`) needs no auth to browse — only the actual GeoPackage *download*
  (`dl1.lantmateriet.se/...zip`) requires HTTP Basic auth. Filtered to Stockholm county
  (`lanskod = '01'`) to match the rest of the app; converted from GeoPackage/WKB
  (EPSG:3006/SWEREF99&nbsp;TM) to GeoJSON (WGS84) by the script.
- **Regenerating the data:** run `node --env-file=.env scripts/generate-municipalities.mjs` with
  `LANTMATERIET_USERNAME`/`LANTMATERIET_PASSWORD` set in `.env` (see `.env.example`). These are
  build-time only, never `VITE_`-prefixed, so they're never inlined into the client bundle.
  ⚠️ Currently this is a personal Lantmäteriet account login, used as a stopgap because devportal
  access to get an Application-scoped Consumer Key/Secret is still blocked (open ticket with
  Lantmäteriet support) — swap this for a proper Application credential once that's resolved, and
  rotate the account password periodically in the meantime since it's sitting in a local `.env`.
- **Other terms to note:** Lantmäteriet may suspend access without notice for technical
  misuse/abuse (§4.1) or, without stating a reason, for information-security/personal-data/
  national-security concerns (§4.2) — no formal SLA. Terms can change unilaterally for minor
  updates; major changes require re-acceptance (§5). Low risk here since this is an occasional
  build-time regeneration, not live production traffic.

### Demographic statistics & RegSO boundaries — SCB (Statistics Sweden)
- **What:** Pre-processed at build time by `scripts/buildStatisticalAreas.mjs` into
  `public/statistical-areas.geojson`; bundled as a static asset. `src/infrastructure/statisticalAreas.ts`
  fetches the local file, same pattern as `municipalities.ts`/`votingDistricts.ts` — no runtime call
  to SCB. Two SCB services are used: the GeoServer WFS (`geodata.scb.se/geoserver/stat/wfs`, layer
  `stat:RegSO_2025`) for official RegSO boundaries and names, and the PxWeb API
  (`api.scb.se/OV0104/v1/doris`) for demographic tables (age, income, foreign background, housing
  tenure, household type, education level) — queried directly with RegSO codes, since these tables
  support both DeSO and RegSO granularity.
- **Terms:** SCB's open data (both the geodata WFS/WMS services and the PxWeb statistical database)
  is licensed **CC0 1.0 Universal** — public domain, no attribution required, explicitly free for
  commercial and production use. No API key or registration needed for either service.
  Sources: https://www.scb.se/en/services/open-data-api/ and
  https://www.scb.se/en/services/open-data-api/open-geodata/open-data-for-deso--demographic-statistical-areas/
- **Obligation:** None required by the license. SCB asks that if you cite a source at all, you use
  "Source: Statistics Sweden" — but explicitly says *not* to cite them as the source once the data
  has been processed (which it has been here: reprojected, joined, normalized), so no attribution
  is surfaced in the map's attribution control.
- **Rate limits:** PxWeb caps requests at 10 calls per 10 seconds per IP and 100,000 values per
  table query (HTTP 403 if exceeded). `buildStatisticalAreas.mjs` issues 6 parallel PxWeb POSTs
  per run, comfortably under the limit. This is a build-time-only concern — there is no runtime
  traffic to SCB, so production usage can never trigger it.
- **Regenerating the data:** run `node scripts/buildStatisticalAreas.mjs`. No credentials needed.

### Voting district results — Valmyndigheten (Swedish Election Authority)
- **What:** Pre-processed at build time into `public/voting-districts-*.geojson` (see comment in
  `src/infrastructure/votingDistricts.ts`); bundled as static assets, no runtime call to
  Valmyndigheten.
- **Terms:** Valmyndigheten publishes its open data as free to use, reuse, and share for any
  purpose, with no fee and no agreement required — the only condition is citing Valmyndigheten as
  the source. Source: https://www.val.se/valresultat-och-statistik/statistik-och-data/om-var-oppna-data
- **Obligation:** surfaced as a visible credit — "Election results: Valmyndigheten" — in the map's
  attribution control (`src/main.ts`), not just a source comment.

### Public transport timetable — Trafiklab GTFS Regional (Samtrafiken)
- **What:** The static SL timetable (`opendata.samtrafiken.se/gtfs/sl/sl.zip`), downloaded at
  build time by `scripts/buildTravelTimes.ts` and turned into precomputed travel times
  (`public/travel-times.bin`, `public/travel-time-destinations.json`). No runtime call to
  Trafiklab — the browser only reads the static files.
- **Terms:** GTFS Regional static data is licensed **CC0 1.0** — public domain, no restrictions,
  commercial and production use allowed, attribution encouraged but not required.
  Source: https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/
- **Not to be confused with** the separate SL API licence
  (https://www.trafiklab.se/api/other-apis/sl/licence/), which covers SL's own live APIs, is
  CC BY-based, and forbids storing independent copies of the data — a reason not to use SL's live
  journey-planner APIs for this feature.
- **Obligation:** None required. We credit "Timetable: Trafiklab/Samtrafiken" in the map's
  attribution control anyway, as Trafiklab encourages.
- **API key:** Required for the download. Stored as `TRAFIKLAB_API_KEY` in `.env` (see
  `.env.example`), build-time only, never `VITE_`-prefixed. The free Bronze level allows 50
  downloads/month, far more than occasional rebuilds need. The script never prints the download
  URL, since it carries the key.
- **Regenerating the data:** `node --env-file=.env scripts/buildTravelTimes.ts` (add
  `--use-cached-gtfs` to reuse `.cache/gtfs/sl.zip`).

### DeSO boundaries — SCB (Statistics Sweden)
- **What:** `stat:DeSO_2025` (and `stat:RegSO_2025` for area names) from the same SCB GeoServer
  WFS as the demographic data above, fetched at build time by `scripts/buildTravelTimes.ts` into
  `public/deso-areas.geojson`. Same CC0 terms and obligations as the SCB entry above.

### Fixed destination coordinates
- **What:** The coordinates in `scripts/travelTimeDestinations.json` were looked up manually.
  No geocoding service is called at build time or runtime.
