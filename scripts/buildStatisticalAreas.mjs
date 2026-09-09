#!/usr/bin/env node
/**
 * Fetches DeSO (Demografiska statistikområden) boundaries from SCB GeoServer
 * and demographic data from SCB PxWeb API, merges and normalizes them, then
 * writes public/statistical-areas.geojson.
 *
 * DeSO is SCB's current small-area statistical unit (replacing SAMS from 2018).
 * Stockholm stad (municipality 0180) has 544 DeSO areas.
 *
 * Data sources:
 *   Boundaries: SCB GeoServer WFS — stat:DeSO_2018 (SWEREF99TM, reprojected to WGS84)
 *   Demographics: SCB PxWeb API v1 (json-stat2), DeSO-level tables
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
// DeSO 2018 codes were retired when DeSO 2025 launched in 2024; use 2023 data throughout.
const YEAR = '2023'
const HOUSING_YEAR = '2023'

// SWEREF99 TM (EPSG:3006) → WGS84
proj4.defs('SWEREF99TM', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')
const toWGS84 = proj4('SWEREF99TM', 'WGS84')

const reprojectCoords = (coords) => {
  if (typeof coords[0] === 'number') return toWGS84.forward([coords[0], coords[1]])
  return coords.map(reprojectCoords)
}

// ── WFS boundary fetch ───────────────────────────────────────────────────────

const fetchBoundaries = async () => {
  const url =
    'https://geodata.scb.se/geoserver/stat/wfs' +
    '?service=WFS&version=2.0.0&request=GetFeature' +
    '&typeNames=stat:DeSO_2018' +
    '&outputFormat=application/json' +
    `&CQL_FILTER=kommunkod='${STOCKHOLM_KOM}'`

  process.stdout.write(`  WFS DeSO_2018 (Stockholm stad) ... `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const geojson = await res.json()
  console.log(`${geojson.features.length} features`)
  return geojson
}

// Returns Map<regsokod, regsonamn> for all RegSO areas in Stockholm stad.
// DeSO areas each belong to a RegSO; the RegSO name is used as the display name.
const fetchRegsoNames = async () => {
  const url =
    'https://geodata.scb.se/geoserver/stat/wfs' +
    '?service=WFS&version=2.0.0&request=GetFeature' +
    '&typeNames=stat:RegSO_2020' +
    '&outputFormat=application/json' +
    `&CQL_FILTER=kommunkod='${STOCKHOLM_KOM}'`

  process.stdout.write(`  WFS RegSO_2020 (for names) ... `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const geojson = await res.json()
  const names = new Map(geojson.features.map(f => [f.properties.regsokod, f.properties.regsonamn]))
  console.log(`${names.size} RegSO names`)
  return names
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

// SCB FolkmDesoAldKon age brackets (last bracket is 80+ written as '80-')
const AGE_BRACKETS = ['-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80-']

const fetchAgeDistribution = async (desoCodes) => {
  const dataset = await scbPost('BE/BE0101/BE0101Y/FolkmDesoAldKon', [
    { code: 'Region', selection: { filter: 'item', values: desoCodes } },
    { code: 'Alder', selection: { filter: 'item', values: ['totalt', ...AGE_BRACKETS] } },
    { code: 'Kon', selection: { filter: 'item', values: ['1+2'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000007Y7'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of desoCodes) {
    const total = readValue(dataset, { Region: code, Alder: 'totalt', Kon: '1+2', ContentsCode: '000007Y7', Tid: YEAR }) ?? 0
    const byBracket = {}
    for (const bracket of AGE_BRACKETS) {
      byBracket[bracket] = readValue(dataset, { Region: code, Alder: bracket, Kon: '1+2', ContentsCode: '000007Y7', Tid: YEAR }) ?? 0
    }

    const sum = (brackets) => brackets.reduce((s, b) => s + (byBracket[b] ?? 0), 0)
    const denom = total > 0 ? total : 1
    result.set(code, {
      ageShare0_17: sum(['-4', '5-9', '10-14', '15-19']) / denom,
      ageShare18_29: sum(['20-24', '25-29']) / denom,
      ageShare30_44: sum(['30-34', '35-39', '40-44']) / denom,
      ageShare45_64: sum(['45-49', '50-54', '55-59', '60-64']) / denom,
      ageShare65plus: sum(['65-69', '70-74', '75-79', '80-']) / denom,
      total,
    })
  }
  return result
}

const fetchMeanNetIncome = async (desoCodes) => {
  // Tab2InkDesoRegso: income structure by DeSO/RegSO
  // Inkomstkomponenter 240 = nettoinkomst, ContentsCode 000008A4 = mean for all (tkr)
  const dataset = await scbPost('HE/HE0110/HE0110I/Tab2InkDesoRegso', [
    { code: 'Region', selection: { filter: 'item', values: desoCodes } },
    { code: 'Inkomstkomponenter', selection: { filter: 'item', values: ['240'] } },
    { code: 'Kon', selection: { filter: 'item', values: ['1+2'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000008A4'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of desoCodes) {
    const val = readValue(dataset, { Region: code, Inkomstkomponenter: '240', Kon: '1+2', ContentsCode: '000008A4', Tid: YEAR })
    // Value is in thousands SEK; store as actual SEK for normalization clarity
    result.set(code, (val ?? 0) * 1000)
  }
  return result
}

const fetchForeignBackground = async (desoCodes) => {
  // FolkmDesoBakgrKon: UtlBakgrund values: '2'=Swedish bg, '1'=foreign bg, 'SA'=total
  // Request only foreign ('1') and total ('SA') to compute the share efficiently.
  const dataset = await scbPost('BE/BE0101/BE0101Y/FolkmDesoBakgrKon', [
    { code: 'Region', selection: { filter: 'item', values: desoCodes } },
    { code: 'UtlBakgrund', selection: { filter: 'item', values: ['1', 'SA'] } },
    { code: 'Kon', selection: { filter: 'item', values: ['1+2'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000007Y4'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of desoCodes) {
    const foreign = readValue(dataset, { Region: code, UtlBakgrund: '1', Kon: '1+2', ContentsCode: '000007Y4', Tid: YEAR }) ?? 0
    const total = readValue(dataset, { Region: code, UtlBakgrund: 'SA', Kon: '1+2', ContentsCode: '000007Y4', Tid: YEAR }) ?? 0
    result.set(code, total > 0 ? foreign / total : 0)
  }
  return result
}

const fetchHouseholdTypes = async (desoCodes) => {
  // HushallDesoTyp: household composition by DeSO
  // Hushallstyp: ESUB=single without children, SBMB=couple with children, ESMB=single parent with children, TOTALT=total
  const dataset = await scbPost('BE/BE0101/BE0101Y/HushallDesoTyp', [
    { code: 'Region', selection: { filter: 'item', values: desoCodes } },
    { code: 'Hushallstyp', selection: { filter: 'item', values: ['ESUB', 'SBMB', 'ESMB', 'TOTALT'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000007Y1'] } },
    { code: 'Tid', selection: { filter: 'item', values: [YEAR] } },
  ])

  const result = new Map()
  for (const code of desoCodes) {
    const total = readValue(dataset, { Region: code, Hushallstyp: 'TOTALT', ContentsCode: '000007Y1', Tid: YEAR }) ?? 0
    const single = readValue(dataset, { Region: code, Hushallstyp: 'ESUB', ContentsCode: '000007Y1', Tid: YEAR }) ?? 0
    const coupleWithChildren = readValue(dataset, { Region: code, Hushallstyp: 'SBMB', ContentsCode: '000007Y1', Tid: YEAR }) ?? 0
    const singleParent = readValue(dataset, { Region: code, Hushallstyp: 'ESMB', ContentsCode: '000007Y1', Tid: YEAR }) ?? 0
    const denom = total > 0 ? total : 1
    result.set(code, {
      singlePersonShare: single / denom,
      familyWithChildrenShare: (coupleWithChildren + singleParent) / denom,
    })
  }
  return result
}

const fetchHousingTenure = async (desoCodes) => {
  // BO0104T10N: housing by tenure at DeSO 2018 level
  // Upplatelseform: 1=hyresrätt(rental), 2=bostadsrätt(co-op owned), 3=äganderätt(house/owned)
  const dataset = await scbPost('BO/BO0104/BO0104D/BO0104T10N', [
    { code: 'Region', selection: { filter: 'item', values: desoCodes } },
    { code: 'Upplatelseform', selection: { filter: 'item', values: ['1', '2', '3'] } },
    { code: 'ContentsCode', selection: { filter: 'item', values: ['000006OC'] } },
    { code: 'Tid', selection: { filter: 'item', values: [HOUSING_YEAR] } },
  ])

  const result = new Map()
  for (const code of desoCodes) {
    const rental = readValue(dataset, { Region: code, Upplatelseform: '1', ContentsCode: '000006OC', Tid: HOUSING_YEAR }) ?? 0
    const owned = readValue(dataset, { Region: code, Upplatelseform: '2', ContentsCode: '000006OC', Tid: HOUSING_YEAR }) ?? 0
    const house = readValue(dataset, { Region: code, Upplatelseform: '3', ContentsCode: '000006OC', Tid: HOUSING_YEAR }) ?? 0
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

console.log('\n=== Building statistical-areas.geojson (DeSO 2018) ===\n')

console.log('1. Fetching DeSO boundaries and RegSO names...')
const [boundaries, regsoNames] = await Promise.all([fetchBoundaries(), fetchRegsoNames()])

const desoCodes = boundaries.features
  .map(f => String(f.properties.desokod ?? '').trim())
  .filter(c => c.length > 0)

console.log(`   Found ${desoCodes.length} DeSO codes`)

console.log('\n2. Fetching demographic data (in parallel)...')

const [ageData, incomeData, foreignData, housingData, householdData] = await Promise.all([
  fetchAgeDistribution(desoCodes).catch(err => { console.warn(`  WARN age: ${err.message}`); return new Map() }),
  fetchMeanNetIncome(desoCodes).catch(err => { console.warn(`  WARN income: ${err.message}`); return new Map() }),
  fetchForeignBackground(desoCodes).catch(err => { console.warn(`  WARN foreign: ${err.message}`); return new Map() }),
  fetchHousingTenure(desoCodes).catch(err => { console.warn(`  WARN housing: ${err.message}`); return new Map() }),
  fetchHouseholdTypes(desoCodes).catch(err => { console.warn(`  WARN household: ${err.message}`); return new Map() }),
])

console.log('\n3. Joining and normalizing...')

const rawVectors = boundaries.features.map(f => {
  const code = String(f.properties.desokod ?? '').trim()
  const age = ageData.get(code) ?? { ageShare0_17: 0, ageShare18_29: 0, ageShare30_44: 0, ageShare45_64: 0, ageShare65plus: 0 }
  const income = incomeData.get(code) ?? 0
  const foreign = foreignData.get(code) ?? 0
  const housing = housingData.get(code) ?? { housingRentalShare: 0, housingOwnedShare: 0, housingHouseShare: 0 }
  const household = householdData.get(code) ?? { singlePersonShare: 0, familyWithChildrenShare: 0 }
  return [
    age.ageShare0_17,
    age.ageShare18_29,
    age.ageShare30_44,
    age.ageShare45_64,
    age.ageShare65plus,
    income,
    foreign,
    housing.housingRentalShare,
    housing.housingOwnedShare,
    household.singlePersonShare,
    household.familyWithChildrenShare,
  ]
})

// Normalize each of the 11 dimensions independently across all DeSO areas
const normalizedByDim = Array.from({ length: 11 }, (_, dim) =>
  minMaxNormalize(rawVectors.map(v => v[dim])),
)

let matched = 0, unmatched = 0

const features = boundaries.features.map((f, idx) => {
  const code = String(f.properties.desokod ?? '').trim()
  const hasData = ageData.has(code) || incomeData.has(code)
  if (hasData) matched++
  else {
    unmatched++
    if (unmatched <= 5) console.log(`  WARN no demographic data for "${code}"`)
  }

  const age = ageData.get(code) ?? { ageShare0_17: 0, ageShare18_29: 0, ageShare30_44: 0, ageShare45_64: 0, ageShare65plus: 0, total: 0 }
  const income = incomeData.get(code) ?? 0
  const foreign = foreignData.get(code) ?? 0
  const housing = housingData.get(code) ?? { housingRentalShare: 0, housingOwnedShare: 0, housingHouseShare: 0 }
  const household = householdData.get(code) ?? { singlePersonShare: 0, familyWithChildrenShare: 0 }

  return {
    type: 'Feature',
    geometry: {
      type: f.geometry.type,
      coordinates: reprojectCoords(f.geometry.coordinates),
    },
    properties: {
      samsCode: code,
      samsName: regsoNames.get(String(f.properties.regsokod ?? '').trim()) ?? code,
      medianIncome: income,
      foreignBackgroundShare: foreign,
      ageShare0_17: age.ageShare0_17,
      ageShare18_29: age.ageShare18_29,
      ageShare30_44: age.ageShare30_44,
      ageShare45_64: age.ageShare45_64,
      ageShare65plus: age.ageShare65plus,
      housingRentalShare: housing.housingRentalShare,
      housingOwnedShare: housing.housingOwnedShare,
      housingHouseShare: housing.housingHouseShare,
      singlePersonShare: household.singlePersonShare,
      familyWithChildrenShare: household.familyWithChildrenShare,
      fv0: normalizedByDim[0][idx],
      fv1: normalizedByDim[1][idx],
      fv2: normalizedByDim[2][idx],
      fv3: normalizedByDim[3][idx],
      fv4: normalizedByDim[4][idx],
      fv5: normalizedByDim[5][idx],
      fv6: normalizedByDim[6][idx],
      fv7: normalizedByDim[7][idx],
      fv8: normalizedByDim[8][idx],
      fv9: normalizedByDim[9][idx],
      fv10: normalizedByDim[10][idx],
    },
  }
})

console.log(`   Join: matched=${matched} unmatched=${unmatched}`)

const geojson = { type: 'FeatureCollection', features }
writeFileSync(OUT_PATH, JSON.stringify(geojson))
const kb = Math.round(Buffer.byteLength(JSON.stringify(geojson)) / 1024)
console.log(`\n4. Written: statistical-areas.geojson (${kb} KB, ${features.length} features)`)
console.log('\nDone.')
