#!/usr/bin/env node
/**
 * Downloads and processes Riksdag voting district data from Valmyndigheten.
 * Outputs public/voting-districts-{year}.geojson for 2010, 2014, and 2018.
 *
 * Filtered to Stockholm county (VD codes starting with "01") to match
 * the existing 2022 dataset.
 *
 * Run: node scripts/generate-voting-districts.mjs
 */

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import readXlsxFile from 'read-excel-file/node'
import proj4 from 'proj4'
import shapefile from 'shapefile'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

// SWEREF99 TM (EPSG:3006) → WGS84 (EPSG:4326)
proj4.defs('SWEREF99TM', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')
const toWGS84 = proj4('SWEREF99TM', 'WGS84')

// 6 decimal places (~11 cm) is far finer than this map ever renders at; the raw
// reprojected floats carry ~15 significant digits of noise that roughly doubles
// the output file size for no visible benefit.
const COORD_PRECISION = 6
const round = (n) => Math.round(n * 10 ** COORD_PRECISION) / 10 ** COORD_PRECISION

const reprojectCoords = (coords) => {
  if (typeof coords[0] === 'number') return toWGS84.forward([coords[0], coords[1]]).map(round)
  return coords.map(reprojectCoords)
}

const PARTY_CODES = new Set(['S', 'M', 'SD', 'C', 'V', 'KD', 'L', 'MP'])
// FP (Folkpartiet) became L (Liberalerna) in 2015
const PARTY_ALIASES = { FP: 'L' }
const normalizeParty = (raw) => PARTY_ALIASES[String(raw).trim().toUpperCase()] ?? String(raw).trim().toUpperCase()

const pad = (n, len) => String(n).padStart(len, '0')

// ── Per-year configuration ───────────────────────────────────────────────────

const YEAR_CONFIGS = {
  2018: {
    resultsUrl: 'https://historik.val.se/val/val2018/statistik/2018_R_per_valdistrikt.xlsx',
    resultsFormat: 'xlsx',
    resultsSheet: 'R antal',
    boundariesUrl: 'https://historik.val.se/val/val2018/statistik/2018_valgeografi_valdistrikt.zip',
    // Columns in the XLSX header row (row 0)
    lanCol: 'LÄNSKOD',
    komCol: 'KOMMUNKOD',
    valdistCol: 'VALDISTRIKTSKOD',
    nameCol: 'VALDISTRIKTSNAMN',
    partyColSuffix: '',      // party columns are bare: "M", "S", "SD", …
    codeField: 'VD',
    nameField: 'VD_NAMN',
    boundariesEncoding: 'UTF-8',
  },
  2014: {
    resultsUrl: 'https://historik.val.se/val/val2014/statistik/2014_riksdagsval_per_valdistrikt.skv',
    resultsFormat: 'skv',
    boundariesUrl: 'https://historik.val.se/val/val2014/statistik/gis/valgeografi_valdistrikt.zip',
    lanCol: 'LAN',
    komCol: 'KOM',
    valdistCol: 'VALDIST',
    nameCol: 'Valdistrikt',
    partyColSuffix: ' tal',  // "M tal", "FP tal", …
    codeField: 'VD',
    nameField: 'VD_NAMN',
  },
  2010: {
    resultsUrl: 'https://historik.val.se/val/val2010/statistik/slutligt_valresultat_valdistrikt_R.skv',
    resultsFormat: 'skv',
    boundariesUrl: 'https://historik.val.se/val/val2010/statistik/gis/alla_valdistrikt.zip',
    lanCol: 'LAN',
    komCol: 'KOM',
    valdistCol: 'VALDIST',
    nameCol: 'VALDISTRIKT',
    partyColSuffix: ' tal',
    codeField: 'LKFV',
    nameField: 'VDNAMN',
  },
}

// ── Utilities ────────────────────────────────────────────────────────────────

const download = async (url) => {
  process.stdout.write(`  DL ${url.split('/').pop()} ... `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`${(buf.length / 1024 / 1024).toFixed(1)} MB`)
  return buf
}

// ── Results parsing ──────────────────────────────────────────────────────────

// Returns Map<vdCode, dominantParty> from a semicolon-separated SKV file.
// Valmyndigheten SKV files are Windows-1252 encoded; codes are already zero-padded.
const parseSKV = (buffer, config) => {
  const text = new TextDecoder('windows-1252').decode(buffer)
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const headers = lines[0].split(';')

  const colIdx = (name) => {
    const i = headers.indexOf(name)
    if (i === -1) throw new Error(`Column "${name}" not found. Headers: ${headers.join(';')}`)
    return i
  }

  const lanCol = colIdx(config.lanCol)
  const komCol = colIdx(config.komCol)
  const valdistCol = colIdx(config.valdistCol)

  const partyColMap = {}
  const suffix = config.partyColSuffix
  headers.forEach((h, i) => {
    if (suffix && !h.endsWith(suffix)) return
    const raw = suffix ? h.slice(0, h.length - suffix.length) : h
    const norm = normalizeParty(raw)
    if (PARTY_CODES.has(norm)) partyColMap[norm] = i
  })
  console.log(`  Party cols: ${JSON.stringify(partyColMap)}`)

  const results = new Map()
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(';')
    const lan = cells[lanCol]?.trim()
    const kom = cells[komCol]?.trim()
    const valdist = cells[valdistCol]?.trim()
    if (!lan || !kom || !valdist) continue

    // Codes are already zero-padded in SKV; concatenate directly
    const vd = lan + kom + valdist

    let dominant = 'OTHER'
    let maxVotes = -1
    for (const [party, col] of Object.entries(partyColMap)) {
      // Numbers use comma as decimal separator — replace before parsing
      const votes = Number(cells[col]?.replace(',', '.') ?? 0)
      if (votes > maxVotes) { maxVotes = votes; dominant = party }
    }
    results.set(vd, dominant)
  }

  console.log(`  Parsed ${results.size} district results`)
  return results
}

// Returns Map<vdCode, dominantParty> from a 2018-style XLSX file.
const parseXLSX = async (buffer, config) => {
  // read-excel-file returns [{sheet, data}] for all sheets; find the target.
  const allSheets = await readXlsxFile(buffer)
  const sheetObj = allSheets.find(s => s.sheet === config.resultsSheet)
  if (!sheetObj) throw new Error(`Sheet "${config.resultsSheet}" not found. Available: ${allSheets.map(s => s.sheet).join(', ')}`)
  const rows = sheetObj.data
  const headers = rows[0].map(String)

  const colIdx = (name) => {
    const i = headers.indexOf(name)
    if (i === -1) throw new Error(`Column "${name}" not found. Headers: ${headers.join(' | ')}`)
    return i
  }

  const lanCol = colIdx(config.lanCol)
  const komCol = colIdx(config.komCol)
  const valdistCol = colIdx(config.valdistCol)

  const partyColMap = {}
  headers.forEach((h, i) => {
    const norm = normalizeParty(h)
    if (PARTY_CODES.has(norm)) partyColMap[norm] = i
  })
  console.log(`  Party cols: ${JSON.stringify(partyColMap)}`)

  const results = new Map()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const lan = row[lanCol]
    const kom = row[komCol]
    const valdist = row[valdistCol]
    if (lan == null || kom == null || valdist == null) continue

    // XLSX values are numbers; pad to match boundary VD codes
    const vd = pad(lan, 2) + pad(kom, 2) + pad(valdist, 4)

    let dominant = 'OTHER'
    let maxVotes = -1
    for (const [party, col] of Object.entries(partyColMap)) {
      const votes = Number(row[col] ?? 0)
      if (votes > maxVotes) { maxVotes = votes; dominant = party }
    }
    results.set(vd, dominant)
  }

  console.log(`  Parsed ${results.size} district results`)
  return results
}

const parseResults = async (buffer, config) =>
  config.resultsFormat === 'xlsx' ? parseXLSX(buffer, config) : parseSKV(buffer, config)

// ── Boundary loading ─────────────────────────────────────────────────────────

const loadBoundaries = async (zipBuffer, config) => {
  const files = unzipSync(new Uint8Array(zipBuffer))

  const shpKey = Object.keys(files).find(k => k.toLowerCase().endsWith('.shp'))
  const dbfKey = Object.keys(files).find(k => k.toLowerCase().endsWith('.dbf'))
  if (!shpKey || !dbfKey) {
    throw new Error('SHP/DBF not found in ZIP. Files: ' + Object.keys(files).join(', '))
  }
  console.log(`  Shapefile: ${shpKey}`)

  const tmpDir = mkdtempSync(join(tmpdir(), 'vd-'))
  try {
    writeFileSync(join(tmpDir, 'data.shp'), Buffer.from(files[shpKey]))
    writeFileSync(join(tmpDir, 'data.dbf'), Buffer.from(files[dbfKey]))
    // DBF text encoding varies by source year — Valmyndigheten's older (2010/2014) shapefiles
    // are windows-1252 (the shapefile spec's de facto default), the 2018 one is UTF-8. Forcing
    // UTF-8 on the older files silently mangled å/ä/ö into U+FFFD.
    const encoding = config.boundariesEncoding ?? 'windows-1252'
    const col = await shapefile.read(join(tmpDir, 'data.shp'), join(tmpDir, 'data.dbf'), { encoding })
    console.log(`  ${col.features.length} boundary features`)
    return col.features
  } finally {
    rmSync(tmpDir, { recursive: true })
  }
}

// ── Main per-year pipeline ───────────────────────────────────────────────────

const processYear = async (year) => {
  console.log(`\n=== ${year} ===`)
  const config = YEAR_CONFIGS[year]

  const [resultsBuf, boundariesBuf] = await Promise.all([
    download(config.resultsUrl),
    download(config.boundariesUrl),
  ])

  const districtResults = await parseResults(resultsBuf, config)
  const rawFeatures = await loadBoundaries(boundariesBuf, config)

  let matched = 0
  let unmatched = 0

  const allFeatures = rawFeatures.map(feature => {
    const props = feature.properties ?? {}
    const districtCode = String(props[config.codeField] ?? '').trim()
    const districtName = String(props[config.nameField] ?? '').trim()
    const dominantParty = districtResults.get(districtCode) ?? 'OTHER'

    if (districtResults.has(districtCode)) matched++
    else {
      unmatched++
      if (unmatched <= 3) console.log(`  WARN no result for "${districtCode}" (${districtName})`)
    }

    return {
      type: 'Feature',
      geometry: {
        type: feature.geometry.type,
        coordinates: reprojectCoords(feature.geometry.coordinates),
      },
      properties: { districtCode, districtName, dominantParty },
    }
  })

  console.log(`  Join: matched=${matched} unmatched=${unmatched}`)

  const stockholmFeatures = allFeatures.filter(f => f.properties.districtCode.startsWith('01'))
  console.log(`  Stockholm: ${stockholmFeatures.length} districts`)

  const geojson = { type: 'FeatureCollection', features: stockholmFeatures }
  const outPath = join(PUBLIC_DIR, `voting-districts-${year}.geojson`)
  writeFileSync(outPath, JSON.stringify(geojson))
  const mb = (Buffer.byteLength(JSON.stringify(geojson)) / 1024 / 1024).toFixed(1)
  console.log(`  Written: voting-districts-${year}.geojson (${mb} MB)`)
}

const requestedYears = process.argv.slice(2).map(Number)
const years = requestedYears.length > 0 ? requestedYears : [2018, 2014, 2010]
for (const year of years) {
  if (!YEAR_CONFIGS[year]) throw new Error(`No config for year ${year}`)
  await processYear(year)
}
console.log('\nAll done.')
