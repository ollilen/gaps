# GAPS

An interactive map for exploring geographic and demographic gaps in Stockholm.

## Tech stack

- **TypeScript** — strict, no `any`
- **MapLibre GL** — open-source map renderer
- **purify-ts** — functional programming primitives (`Maybe`, `Either`, `EitherAsync`)
- **Vite** — dev server and bundler
- **Vitest** — unit tests

The codebase follows functional programming and Domain-Driven Design principles: pure functions, immutable data, errors as values (never thrown), and code organised by domain rather than technical layer.

## Features

| Status | Feature |
|--------|---------|
| Done | **Stockholm municipalities** — all municipalities in Stockholm county rendered as a fill layer with hover tooltips |
| Done | **Voting districts colored by party** — overlay voting districts (valdistrikt) colored by dominant party for riksdag elections 2010–2022; party legend, year selector, and hover tooltips |
| Done | **Demographic similarity** — click a DeSO statistical area and highlight other areas across Stockholm with the most similar demographic profile; side panel lists the top 5 matches with relative similarity scores |

## Data sources

### Live (fetched at runtime)

| Source | What is fetched |
|--------|----------------|
| **OpenFreeMap** `tiles.openfreemap.org` | Vector base map tiles (Liberty style, sprites, glyphs) rendered as the background layer by MapLibre GL. Do not point this at `tile.openstreetmap.org` — that server is for light testing only and throttles/drops requests from a deployed app |

### Build-time (pre-processed into static GeoJSON, bundled under `public/`)

These sources are queried by scripts in `scripts/` and the output is committed as static assets. Re-run the scripts to refresh the data.

#### Lantmäteriet ("Kommun, län och rike") — `api.lantmateriet.se` / `dl1.lantmateriet.se`

Produces `public/municipalities.geojson` — municipality boundary polygons for Stockholm county (26 municipalities), filtered from the national dataset and reprojected from SWEREF99 TM to WGS84.

Script: `scripts/generate-municipalities.mjs`

#### Valmyndigheten (Swedish Election Authority) — `historik.val.se`

Produces `public/voting-districts-{year}.geojson` for 2010, 2014, 2018, and 2022.

| Asset | What is fetched |
|-------|----------------|
| Election results (XLSX / SKV) | Vote counts per party per voting district for riksdag elections — used to determine the dominant party in each district |
| Boundary shapefiles (ZIP) | Voting district polygons in SWEREF99TM projection — reprojected to WGS84 at build time |

Script: `scripts/generate-voting-districts.mjs`

#### SCB GeoServer WFS — `geodata.scb.se/geoserver/stat/wfs`

| Layer | What is fetched |
|-------|----------------|
| `stat:DeSO_2018` | 544 DeSO statistical area boundaries for Stockholm stad (`kommunkod='0180'`) in SWEREF99TM — reprojected to WGS84 |
| `stat:RegSO_2020` | 127 RegSO area boundaries for Stockholm stad — used only to join human-readable area names (`regsonamn`) to their DeSO sub-areas via `regsokod` |

DeSO (Demografiska statistikområden) is SCB's current small-area statistical unit, introduced in 2018 to replace SAMS. DeSO 2018 codes were retired when DeSO 2025 launched; all demographic queries therefore use year 2023.

#### SCB PxWeb API v1 — `api.scb.se/OV0104/v1/doris/sv/ssd`

All queries use DeSO 2018 codes, year 2023, filtered to the 544 Stockholm stad areas. Returns json-stat2 format.

| Table | What is fetched | Used for |
|-------|----------------|----------|
| `BE/BE0101/BE0101Y/FolkmDesoAldKon` | Population by DeSO area, 5-year age bracket, and sex | 17 age-bracket shares, at source granularity (0–4 ... 80+) |
| `HE/HE0110/HE0110I/Tab2InkDesoRegso` | Income components by DeSO area — component 240 (nettoinkomst), mean for all | Mean net income per person. SCB does not publish a median at DeSO level — only mean, share-with-income-type, and person count are available at this granularity |
| `BE/BE0101/BE0101Y/FolkmDesoBakgrKon` | Population by DeSO area and foreign background | Share of residents with foreign background |
| `BO/BO0104/BO0104D/BO0104T10N` | Housing units by DeSO area and tenure type | Shares of rental, co-op owned (bostadsrätt), and owned house |
| `BE/BE0101/BE0101Y/HushallDesoTyp` | Households by DeSO area and type | Shares of all 5 household categories: couple with/without children, single parent, single person, other |

Each table contributes one or more dimensions to a 26-component feature vector per area:

| Component | Dimension | Source table |
|-----------|-----------|-------------|
| `fv0`–`fv16` | Share of population in each 5-year age bracket (0–4, 5–9, ... 75–79, 80+) | `FolkmDesoAldKon` |
| `fv17` | Mean net income per person | `Tab2InkDesoRegso` |
| `fv18` | Share of residents with foreign background | `FolkmDesoBakgrKon` |
| `fv19` | Share of housing that is rental (hyresrätt) | `BO0104T10N` |
| `fv20` | Share of housing that is co-op owned (bostadsrätt) | `BO0104T10N` |
| `fv21` | Share of households that are couples with children (sammanboende med barn) | `HushallDesoTyp` |
| `fv22` | Share of households that are couples without children (sammanboende utan barn) | `HushallDesoTyp` |
| `fv23` | Share of households that are single parents (ensamstående med barn) | `HushallDesoTyp` |
| `fv24` | Share of households that are single people (ensamstående utan barn) | `HushallDesoTyp` |
| `fv25` | Share of households in the "other" category (övriga hushåll) | `HushallDesoTyp` |

`BO0104T10N` also fetches the owned-house (äganderätt) share, but it is not included in the vector because the three tenure shares always sum to 1 — adding it would be redundant. The 17 age brackets and 5 household categories are each used in full (they also sum to 1 within their group), so some linear redundancy is intentionally present there. Each dimension is min-max normalized independently across all 544 areas before similarity is computed. Similarity between two areas is the Euclidean similarity in this 26-dimensional normalized space: `1 − distance / √26`.

Script: `scripts/buildStatisticalAreas.mjs`

---

## Development

```sh
npm install
npm run dev
```

## Testing

```sh
npm test          # run tests
npm run typecheck # type-check only
```

## Build

```sh
npm run build
```

## Rebuilding data assets

```sh
# Voting districts (2010, 2014, 2018) — downloads from historik.val.se
node scripts/generate-voting-districts.mjs

# Demographic similarity data — queries SCB WFS and PxWeb APIs
node scripts/buildStatisticalAreas.mjs
```
