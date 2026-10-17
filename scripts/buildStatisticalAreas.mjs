#!/usr/bin/env node
/**
 * Fetches RegSO (Regionala statistikområden) boundaries from SCB GeoServer
 * and demographic data from SCB PxWeb API, merges and normalizes them, then
 * writes public/statistical-areas.geojson.
 *
 * RegSO is SCB's named, human-facing small-area grouping, one level up from the unnamed
 * DeSO building-block areas (each RegSO groups several DeSO areas). Querying at RegSO level
 * directly — rather than aggregating DeSO areas ourselves — gives every area an official,
 * unique name and lets SCB's own tables do the aggregation. Stockholm stad (municipality
 * 0180) has 127 RegSO areas.
 *
 * Data sources:
 *   Boundaries: SCB GeoServer WFS — stat:RegSO_2025 (SWEREF99TM, reprojected to WGS84)
 *   Demographics: SCB PxWeb API v1 (json-stat2), DeSO/RegSO-level tables queried with RegSO 2025 codes
 *
 * Run: node scripts/buildStatisticalAreas.mjs
 */

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import proj4 from 'proj4'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')
const OUT_PATH = join(PUBLIC_DIR, 'statistical-areas.geojson')

const STOCKHOLM_KOM = '0180'
// 2024 is the latest year every source table covers: the income table (Tab2InkDesoRegso) stops
// there, while the population tables already have 2025. Data from 2024 onward is published only
// for the RegSO 2025 area division, so boundaries and all six tables must use RegSO 2025.
const YEAR = '2024'

// PxWeb tables that carry both area divisions suffix RegSO 2025 codes (e.g. 0180R001_RegSO2025);
// the WFS layer and the published GeoJSON use the bare code.
const toPxWebRegion = (regsoCode) => `${regsoCode}_RegSO2025`

// SWEREF99 TM (EPSG:3006) → WGS84
proj4.defs('SWEREF99TM', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')
const toWGS84 = proj4('SWEREF99TM', 'WGS84')

const reprojectCoords = (coords) => {
  if (typeof coords[0] === 'number') return toWGS84.forward([coords[0], coords[1]])
  return coords.map(reprojectCoords)
}

// ── WFS boundary fetch ───────────────────────────────────────────────────────

// RegSO features already carry their own official name (regsonamn), so no separate name join
// is needed — unlike DeSO, which has no name of its own.
const fetchBoundaries = async () => {
  const url =
    'https://geodata.scb.se/geoserver/stat/wfs' +
    '?service=WFS&version=2.0.0&request=GetFeature' +
    '&typeNames=stat:RegSO_2025' +
    '&outputFormat=application/json' +
    `&CQL_FILTER=kommunkod='${STOCKHOLM_KOM}'`

  process.stdout.write(`  WFS RegSO_2025 (Stockholm stad) ... `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const geojson = await res.json()
  console.log(`${geojson.features.length} features`)
  return geojson
}

// ── PxWeb helpers ────────────────────────────────────────────────────────────

const SCB = 'https://api.scb.se/OV0104/v1/doris/sv/ssd/START'

const scbPost = async (tablePath, query) => {
  const url = `${SCB}/${tablePath}`
  process.stdout.write(`  POST ${tablePath.split('/').pop()} ... `)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, response: { format: 'json-stat2' } }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  console.log(`${data.value.length} values`)
  return data
}

/**
 * Reads a value from a json-stat2 dataset by dimension category codes.
 * dimCodes maps dimension name → category code string.
 */
const readValue = (dataset, dimCodes) => {
  let idx = 0
  let stride = 1
  const reversedIds = [...dataset.id].reverse()
  for (const dimId of reversedIds) {
    const code = dimCodes[dimId]
    if (code == null) {
      stride *= dataset.size[dataset.id.indexOf(dimId)]
      continue
    }
    const catIdx = dataset.dimension[dimId].category.index[code]
    if (catIdx == null) return null
    idx += catIdx * stride
    stride *= dataset.size[dataset.id.indexOf(dimId)]
  }
  return dataset.value[idx] ?? null
}

// ── Demographic fetches ──────────────────────────────────────────────────────

// SCB FolkmDesoAldKon age brackets (last bracket is 80+ written as '80-'), mapped to the
// property name each bracket's share is stored under. Kept at source granularity rather than
// collapsed into broader buckets, per Olivia's request to match what SCB actually publishes.
const AGE_BRACKET_FIELDS = {
  '-4': 'ageShare00_04',
  '5-9': 'ageShare05_09',
  '10-14': 'ageShare10_14',
  '15-19': 'ageShare15_19',
  '20-24': 'ageShare20_24',
  '25-29': 'ageShare25_29',
  '30-34': 'ageShare30_34',
  '35-39': 'ageShare35_39',
  '40-44': 'ageShare40_44',
  '45-49': 'ageShare45_49',
  '50-54': 'ageShare50_54',
  '55-59': 'ageShare55_59',
  '60-64': 'ageShare60_64',
  '65-69': 'ageShare65_69',
  '70-74': 'ageShare70_74',
  '75-79': 'ageShare75_79',
  '80-': 'ageShare80Plus',
}
const AGE_BRACKETS = Object.keys(AGE_BRACKET_FIELDS)
const AGE_SHARE_FIELDS = Object.values(AGE_BRACKET_FIELDS)

const fetchAgeDistribution = async (regsoCodes) => {
  const dataset = await scbPost('BE/BE0101/BE0101Y/FolkmDesoAldKon', [
    { code: 'Region', selection: { filter: 'item', values: regsoCodes.map(toPxWebRegion) } },
    { code: 'Alder', selection: { filter: 'item', values: ['totalt', ...AGE_BRACKETS] } },
    { code: 'Kon', selection: { filter: 'item', values: ['1+2'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000007Y7'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of regsoCodes) {
    const total = readValue(dataset, { Region: toPxWebRegion(code), Alder: 'totalt', Kon: '1+2', ContentsCode: '000007Y7', Tid: YEAR }) ?? 0
    const denom = total > 0 ? total : 1
    const shares = {}
    for (const bracket of AGE_BRACKETS) {
      const count = readValue(dataset, { Region: toPxWebRegion(code), Alder: bracket, Kon: '1+2', ContentsCode: '000007Y7', Tid: YEAR }) ?? 0
      shares[AGE_BRACKET_FIELDS[bracket]] = count / denom
    }
    result.set(code, shares)
  }
  return result
}

const fetchMeanNetIncome = async (regsoCodes) => {
  // Tab2InkDesoRegso: income structure by DeSO/RegSO
  // Inkomstkomponenter 240 = nettoinkomst, ContentsCode 000008A4 = mean for all (tkr)
  const dataset = await scbPost('HE/HE0110/HE0110I/Tab2InkDesoRegso', [
    { code: 'Region', selection: { filter: 'item', values: regsoCodes.map(toPxWebRegion) } },
    { code: 'Inkomstkomponenter', selection: { filter: 'item', values: ['240'] } },
    { code: 'Kon', selection: { filter: 'item', values: ['1+2'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000008A4'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of regsoCodes) {
    const val = readValue(dataset, { Region: toPxWebRegion(code), Inkomstkomponenter: '240', Kon: '1+2', ContentsCode: '000008A4', Tid: YEAR })
    // Value is in thousands SEK; store as actual SEK for normalization clarity
    result.set(code, (val ?? 0) * 1000)
  }
  return result
}

const fetchForeignBackground = async (regsoCodes) => {
  // FolkmDesoBakgrKon: UtlBakgrund values: '2'=Swedish bg, '1'=foreign bg, 'SA'=total
  // Request only foreign ('1') and total ('SA') to compute the share efficiently.
  const dataset = await scbPost('BE/BE0101/BE0101Y/FolkmDesoBakgrKon', [
    { code: 'Region', selection: { filter: 'item', values: regsoCodes.map(toPxWebRegion) } },
    { code: 'UtlBakgrund', selection: { filter: 'item', values: ['1', 'SA'] } },
    { code: 'Kon', selection: { filter: 'item', values: ['1+2'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000007Y4'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of regsoCodes) {
    const foreign = readValue(dataset, { Region: toPxWebRegion(code), UtlBakgrund: '1', Kon: '1+2', ContentsCode: '000007Y4', Tid: YEAR }) ?? 0
    const total = readValue(dataset, { Region: toPxWebRegion(code), UtlBakgrund: 'SA', Kon: '1+2', ContentsCode: '000007Y4', Tid: YEAR }) ?? 0
    result.set(code, total > 0 ? foreign / total : 0)
  }
  return result
}

// HushallDesoTyp's full category set (excluding TOTALT, the denominator):
// SBMB=couple with children, SBUB=couple without children, ESMB=single parent with children,
// ESUB=single without children, OVRIGA=other households (e.g. shared housing, multi-family).
const HOUSEHOLD_CATEGORY_FIELDS = {
  SBMB: 'coupleWithChildrenShare',
  SBUB: 'coupleWithoutChildrenShare',
  ESMB: 'singleParentShare',
  ESUB: 'singlePersonShare',
  OVRIGA: 'otherHouseholdShare',
}
const HOUSEHOLD_CATEGORIES = Object.keys(HOUSEHOLD_CATEGORY_FIELDS)
const HOUSEHOLD_SHARE_FIELDS = Object.values(HOUSEHOLD_CATEGORY_FIELDS)

const fetchHouseholdTypes = async (regsoCodes) => {
  const dataset = await scbPost('BE/BE0101/BE0101Y/HushallDesoTyp', [
    { code: 'Region', selection: { filter: 'item', values: regsoCodes.map(toPxWebRegion) } },
    { code: 'Hushallstyp', selection: { filter: 'item', values: [...HOUSEHOLD_CATEGORIES, 'TOTALT'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000007Y1'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of regsoCodes) {
    const total = readValue(dataset, { Region: toPxWebRegion(code), Hushallstyp: 'TOTALT', ContentsCode: '000007Y1', Tid: YEAR }) ?? 0
    const denom = total > 0 ? total : 1
    const shares = {}
    for (const category of HOUSEHOLD_CATEGORIES) {
      const count = readValue(dataset, { Region: toPxWebRegion(code), Hushallstyp: category, ContentsCode: '000007Y1', Tid: YEAR }) ?? 0
      shares[HOUSEHOLD_CATEGORY_FIELDS[category]] = count / denom
    }
    result.set(code, shares)
  }
  return result
}

// UtbSUNBefDesoRegsoN covers only population aged 25-65 (not the whole population, unlike the
// other demographic tables) and has no separate TOTALT code — these 5 levels exhaustively
// partition that population, so their sum is the denominator.
const EDUCATION_CATEGORY_FIELDS = {
  '21': 'educationPreSecondaryShare',
  '3+4': 'educationSecondaryShare',
  '5': 'educationPostSecondaryShortShare',
  '6': 'educationPostSecondaryLongShare',
  US: 'educationUnknownShare',
}
const EDUCATION_CATEGORIES = Object.keys(EDUCATION_CATEGORY_FIELDS)
const EDUCATION_SHARE_FIELDS = Object.values(EDUCATION_CATEGORY_FIELDS)

const fetchEducationLevels = async (regsoCodes) => {
  const dataset = await scbPost('UF/UF0506/UF0506D/UtbSUNBefDesoRegsoN', [
    { code: 'Region', selection: { filter: 'item', values: regsoCodes.map(toPxWebRegion) } },
    { code: 'UtbildningsNiva', selection: { filter: 'item', values: EDUCATION_CATEGORIES } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000007Z6'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of regsoCodes) {
    const counts = EDUCATION_CATEGORIES.map(
      category => readValue(dataset, { Region: toPxWebRegion(code), UtbildningsNiva: category, ContentsCode: '000007Z6', Tid: YEAR }) ?? 0,
    )
    const total = counts.reduce((sum, count) => sum + count, 0)
    const denom = total > 0 ? total : 1
    const shares = {}
    EDUCATION_CATEGORIES.forEach((category, i) => {
      shares[EDUCATION_CATEGORY_FIELDS[category]] = counts[i] / denom
    })
    result.set(code, shares)
  }
  return result
}

const fetchHousingTenure = async (regsoCodes) => {
  // BO0104T01N2: housing by tenure, queried at RegSO 2025 level
  // Upplatelseform: 1=hyresrätt(rental), 2=bostadsrätt(co-op owned), 3=äganderätt(house/owned)
  const dataset = await scbPost('BO/BO0104/BO0104D/BO0104T01N2', [
    { code: 'Region', selection: { filter: 'item', values: regsoCodes.map(toPxWebRegion) } },
    { code: 'Upplatelseform', selection: { filter: 'item', values: ['1', '2', '3'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['00000864'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of regsoCodes) {
    const rental = readValue(dataset, { Region: toPxWebRegion(code), Upplatelseform: '1', ContentsCode: '00000864', Tid: YEAR }) ?? 0
    const owned = readValue(dataset, { Region: toPxWebRegion(code), Upplatelseform: '2', ContentsCode: '00000864', Tid: YEAR }) ?? 0
    const house = readValue(dataset, { Region: toPxWebRegion(code), Upplatelseform: '3', ContentsCode: '00000864', Tid: YEAR }) ?? 0
    const total = rental + owned + house
    result.set(code, {
      housingRentalShare: total > 0 ? rental / total : 0,
      housingOwnedShare: total > 0 ? owned / total : 0,
      housingHouseShare: total > 0 ? house / total : 0,
    })
  }
  return result
}

// ── Normalization ────────────────────────────────────────────────────────────

const minMaxNormalize = (values) => {
  const finite = values.filter(Number.isFinite)
  if (finite.length === 0) return values.map(() => 0)
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const range = max - min
  return values.map(v => (range === 0 || !Number.isFinite(v) ? 0 : (v - min) / range))
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n=== Building statistical-areas.geojson (RegSO 2025) ===\n')

console.log('1. Fetching RegSO boundaries...')
const boundaries = await fetchBoundaries()

const regsoCodes = boundaries.features
  .map(f => String(f.properties.regsokod ?? '').trim())
  .filter(c => c.length > 0)

console.log(`   Found ${regsoCodes.length} RegSO codes`)

console.log('\n2. Fetching demographic data (in parallel)...')

const [ageData, incomeData, foreignData, housingData, householdData, educationData] = await Promise.all([
  fetchAgeDistribution(regsoCodes).catch(err => { console.warn(`  WARN age: ${err.message}`); return new Map() }),
  fetchMeanNetIncome(regsoCodes).catch(err => { console.warn(`  WARN income: ${err.message}`); return new Map() }),
  fetchForeignBackground(regsoCodes).catch(err => { console.warn(`  WARN foreign: ${err.message}`); return new Map() }),
  fetchHousingTenure(regsoCodes).catch(err => { console.warn(`  WARN housing: ${err.message}`); return new Map() }),
  fetchHouseholdTypes(regsoCodes).catch(err => { console.warn(`  WARN household: ${err.message}`); return new Map() }),
  fetchEducationLevels(regsoCodes).catch(err => { console.warn(`  WARN education: ${err.message}`); return new Map() }),
])

console.log('\n3. Joining and normalizing...')

const AGE_SHARE_DEFAULTS = Object.fromEntries(AGE_SHARE_FIELDS.map(field => [field, 0]))
const HOUSEHOLD_SHARE_DEFAULTS = Object.fromEntries(HOUSEHOLD_SHARE_FIELDS.map(field => [field, 0]))
const EDUCATION_SHARE_DEFAULTS = Object.fromEntries(EDUCATION_SHARE_FIELDS.map(field => [field, 0]))
const HOUSING_DEFAULTS = { housingRentalShare: 0, housingOwnedShare: 0, housingHouseShare: 0 }

// Fields that make up the similarity vector, in fv0..fvN order. housingHouseShare is
// deliberately excluded — the three tenure shares sum to 1, so including it would be redundant.
const VECTOR_FIELDS = [...AGE_SHARE_FIELDS, 'meanIncome', 'foreignBackgroundShare', 'housingRentalShare', 'housingOwnedShare', ...HOUSEHOLD_SHARE_FIELDS, ...EDUCATION_SHARE_FIELDS]

const namedPropertiesFor = (code) => ({
  ...AGE_SHARE_DEFAULTS,
  ...(ageData.get(code) ?? {}),
  meanIncome: incomeData.get(code) ?? 0,
  foreignBackgroundShare: foreignData.get(code) ?? 0,
  ...HOUSING_DEFAULTS,
  ...(housingData.get(code) ?? {}),
  ...HOUSEHOLD_SHARE_DEFAULTS,
  ...(householdData.get(code) ?? {}),
  ...EDUCATION_SHARE_DEFAULTS,
  ...(educationData.get(code) ?? {}),
})

const regsoNamedProperties = boundaries.features.map(f => namedPropertiesFor(String(f.properties.regsokod ?? '').trim()))

const rawVectors = regsoNamedProperties.map(named => VECTOR_FIELDS.map(field => named[field]))

// Normalize each dimension independently across all RegSO areas
const normalizedByDim = Array.from({ length: VECTOR_FIELDS.length }, (_, dim) =>
  minMaxNormalize(rawVectors.map(v => v[dim])),
)

let matched = 0, unmatched = 0

const features = boundaries.features.map((f, idx) => {
  const code = String(f.properties.regsokod ?? '').trim()
  const hasData = ageData.has(code) || incomeData.has(code)
  if (hasData) matched++
  else {
    unmatched++
    if (unmatched <= 5) console.log(`  WARN no demographic data for "${code}"`)
  }

  const named = regsoNamedProperties[idx]
  const fvEntries = Object.fromEntries(VECTOR_FIELDS.map((_, dim) => [`fv${dim}`, normalizedByDim[dim][idx]]))

  return {
    type: 'Feature',
    geometry: {
      type: f.geometry.type,
      coordinates: reprojectCoords(f.geometry.coordinates),
    },
    properties: {
      samsCode: code,
      samsName: f.properties.regsonamn ?? code,
      ...named,
      ...fvEntries,
    },
  }
})

console.log(`   Join: matched=${matched} unmatched=${unmatched}`)

const geojson = { type: 'FeatureCollection', features }
writeFileSync(OUT_PATH, JSON.stringify(geojson))
const kb = Math.round(Buffer.byteLength(JSON.stringify(geojson)) / 1024)
console.log(`\n4. Written: statistical-areas.geojson (${kb} KB, ${features.length} features)`)
console.log('\nDone.')
