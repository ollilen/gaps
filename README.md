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
| Done | **Demographic similarity** — click a RegSO area and highlight other areas across Stockholm with the most similar demographic profile; side panel lists the top 10 matches with relative similarity scores |

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
| `stat:RegSO_2025` | 127 RegSO (Regionala statistikområden) boundaries for Stockholm stad (`kommunkod='0180'`) in SWEREF99TM — reprojected to WGS84 |

RegSO is SCB's named, human-facing small-area grouping — one level up from DeSO (Demografiska statistikområden), the unnamed small-area statistical building block introduced in 2018 to replace SAMS. Each RegSO groups several DeSO areas and carries its own official name (`regsonamn`), unlike DeSO which has no name of its own. All demographic tables below are queried directly with RegSO codes (they're designed to support either granularity — hence names like `Tab2InkDesoRegso`), so SCB does the aggregation rather than this script summing DeSO areas itself. Data from 2024 onward is published only for the RegSO 2025 area division, so the boundaries and every table use RegSO 2025. The year is 2024 — the latest year all six tables cover (the income table has no 2025 data yet).

#### SCB PxWeb API v1 — `api.scb.se/OV0104/v1/doris/sv/ssd`

All queries use RegSO 2025 codes (`<code>_RegSO2025` in PxWeb), year 2024, filtered to the 127 Stockholm stad areas. Returns json-stat2 format.

| Table | What is fetched | Used for |
|-------|----------------|----------|
| `BE/BE0101/BE0101Y/FolkmDesoAldKon` | Population by RegSO area, 5-year age bracket, and sex | 17 age-bracket shares, at source granularity (0–4 ... 80+) |
| `HE/HE0110/HE0110I/Tab2InkDesoRegso` | Income components by RegSO area — component 240 (nettoinkomst), mean for all | Mean net income per person. SCB does not publish a median at this granularity — only mean, share-with-income-type, and person count are available |
| `BE/BE0101/BE0101Y/FolkmDesoBakgrKon` | Population by RegSO area and foreign background | Share of residents with foreign background |
| `BO/BO0104/BO0104D/BO0104T01N2` | Housing units by RegSO area and tenure type | Shares of rental, co-op owned (bostadsrätt), and owned house |
| `BE/BE0101/BE0101Y/HushallDesoTyp` | Households by RegSO area and type | Shares of all 5 household categories: couple with/without children, single parent, single person, other |
| `UF/UF0506/UF0506D/UtbSUNBefDesoRegsoN` | Population aged 25–65 by RegSO area and education level | Shares of all 5 education categories: pre-secondary, secondary, post-secondary (<3yr), post-secondary (3yr+), unknown. Unlike the other tables, this one only covers ages 25–65, not the whole population |

Each table contributes one or more dimensions to a 31-component feature vector per area:

| Component | Dimension | Source table |
|-----------|-----------|-------------|
| `fv0`–`fv16` | Share of population in each 5-year age bracket (0–4, 5–9, ... 75–79, 80+) | `FolkmDesoAldKon` |
| `fv17` | Mean net income per person | `Tab2InkDesoRegso` |
| `fv18` | Share of residents with foreign background | `FolkmDesoBakgrKon` |
| `fv19` | Share of housing that is rental (hyresrätt) | `BO0104T01N2` |
| `fv20` | Share of housing that is co-op owned (bostadsrätt) | `BO0104T01N2` |
| `fv21` | Share of households that are couples with children (sammanboende med barn) | `HushallDesoTyp` |
| `fv22` | Share of households that are couples without children (sammanboende utan barn) | `HushallDesoTyp` |
| `fv23` | Share of households that are single parents (ensamstående med barn) | `HushallDesoTyp` |
| `fv24` | Share of households that are single people (ensamstående utan barn) | `HushallDesoTyp` |
| `fv25` | Share of households in the "other" category (övriga hushåll) | `HushallDesoTyp` |
| `fv26` | Share of population (25–65) with pre-secondary education (förgymnasial) | `UtbSUNBefDesoRegsoN` |
| `fv27` | Share of population (25–65) with secondary education (gymnasial) | `UtbSUNBefDesoRegsoN` |
| `fv28` | Share of population (25–65) with post-secondary education, <3 years | `UtbSUNBefDesoRegsoN` |
| `fv29` | Share of population (25–65) with post-secondary education, 3+ years | `UtbSUNBefDesoRegsoN` |
| `fv30` | Share of population (25–65) with unrecorded education level | `UtbSUNBefDesoRegsoN` |

`BO0104T01N2` also fetches the owned-house (äganderätt) share, but it is not included in the vector because the three tenure shares always sum to 1 — adding it would be redundant. The 17 age brackets, 5 household categories, and 5 education categories are each used in full (they also sum to 1 within their group), so some linear redundancy is intentionally present there. Each dimension is min-max normalized independently across all 127 areas before similarity is computed.

Similarity between two areas is the Euclidean similarity in this 31-dimensional normalized space, but dimensions are weighted **by category rather than individually**: age (17 dims), income (1), foreign background (1), housing (2), household type (5), and education (5) each get equal total weight (1/6), with each dimension inside a category getting an equal share of its category's weight. Without this, age, household type, and education — simply by having many more sub-dimensions — would dominate the score over categories like income that are represented by a single dimension. Concretely: `similarity = 1 − √(Σ wᵢ·(aᵢ−bᵢ)²)`, where `wᵢ = 1 / (6 × dimensions in category i)`, so the weights sum to 1.

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
