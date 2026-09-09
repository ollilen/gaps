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
import AdmZip from 'adm-zip'
import * as XLSX from 'xlsx'
import proj4 from 'proj4'
import shapefile from 'shapefile'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

// SWEREF99 TM (EPSG:3006) → WGS84 (EPSG:4326)
proj4.defs('SWEREF99TM', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')
const toWGS84 = proj4('SWEREF99TM', 'WGS84')

const reprojectCoords = (coords) => {
  if (typeof coords[0] === 'number') return toWGS84.forward([coords[0], coords[1]])
  return coords.map(reprojectCoords)
}

// Party codes we track; all others → 'OTHER'
const PARTY_CODES = new Set(['S', 'M', 'SD', 'C', 'V', 'KD', 'L', 'MP'])
// FP (Folkpartiet) became L (Liberalerna) in 2015
const PARTY_ALIASES = { FP: 'L' }
const normalizeParty = (raw) => {
  const upper = String(raw).trim().toUpperCase()
  return PARTY_ALIASES[upper] ?? upper
}

const pad = (n, len) => String(n).padStart(len, '0')
const buildVD = (lan, kom, valdist) => pad(lan, 2) + pad(kom, 2) + pad(valdist, 4)

// ── Per-year configuration ───────────────────────────────────────────────────

const YEAR_CONFIGS = {
  2018: {
    resultsUrl: 'https://historik.val.se/val/val2018/statistik/2018_R_per_valdistrikt.xlsx',
    boundariesUrl: 'https://historik.val.se/val/val2018/statistik/2018_valgeografi_valdistrikt.zip',
    sheetName: 'R antal',
    headerRow: 0,
    lanCol: 'LÄNSKOD',
    komCol: 'KOMMUNKOD',
    valdistCol: 'VALDISTRIKTSKOD',
    nameCol: 'VALDISTRIKTSNAMN',
    // Party columns are bare abbreviations: "M", "C", "L", "S", …
    partyColSuffix: '',
    codeField: 'VD',
    nameField: 'VD_NAMN',
  },
  2014: {
    resultsUrl: 'https://historik.val.se/val/val2014/statistik/2014_riksdagsval_per_valdistrikt.xls',
    boundariesUrl: 'https://historik.val.se/val/val2014/statistik/gis/valgeografi_valdistrikt.zip',
    sheetName: null,
    headerRow: 2,
    lanCol: 'LAN',
    komCol: 'KOM',
    valdistCol: 'VALDIST',
    nameCol: 'Valdistrikt',
    // Party columns have " tal" suffix: "M tal", "FP tal", …
    partyColSuffix: ' tal',
    codeField: 'VD',
    nameField: 'VD_NAMN',
  },
  2010: {
    resultsUrl: 'https://historik.val.se/val/val2010/statistik/slutligt_valresultat_valdistrikt_R.xls',
    boundariesUrl: 'https://historik.val.se/val/val2010/statistik/gis/alla_valdistrikt.zip',
    sheetName: null,
    headerRow: 0,
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
  process.stdout.write(`  DL ${url.split('/').slice(-1)[0]} ... `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`${(buf.length / 1024 / 1024).toFixed(1)} MB`)
  return buf
}

// ── Results parsing ──────────────────────────────────────────────────────────

const parseResults = (buffer, config) => {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[config.sheetName ?? wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const headers = rows[config.headerRow].map(String)

  const colIdx = (name) => {
    const i = headers.findIndex(h => h === name)
    if (i === -1) throw new Error(`Column "${name}" not found. Headers: ${headers.join(' | ')}`)
    return i
  }

  const lanCol = colIdx(config.lanCol)
  const komCol = colIdx(config.komCol)
  const valdistCol = colIdx(config.valdistCol)

  // Find party vote columns: exact match (2018) or "{PARTY}{suffix}" (2014/2010)
  const partyColMap = {} // normalizedPartyCode → colIndex
  const suffix = config.partyColSuffix
  headers.forEach((h, i) => {
    const raw = suffix ? h.slice(0, h.length - suffix.length) : h
    if (suffix && !h.endsWith(suffix)) return
    const norm = normalizeParty(raw)
    if (PARTY_CODES.has(norm)) partyColMap[norm] = i
  })
  console.log(`  Party cols: ${JSON.stringify(Object.fromEntries(Object.entries(partyColMap).map(([p, i]) => [p, headers[i]])))  }`)

  const results = new Map()
  for (let i = config.headerRow + 1; i < rows.length; i++) {
    const row = rows[i]
    const lan = row[lanCol]
    const kom = row[komCol]
    const valdist = row[valdistCol]
    if (!lan || !kom || !valdist) continue

    const vd = buildVD(lan, kom, valdist)
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

// ── Boundary loading ─────────────────────────────────────────────────────────

const loadBoundaries = async (zipBuffer, config) => {
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries()

  const shpEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.shp'))
  const dbfEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.dbf'))
  if (!shpEntry || !dbfEntry) {
    throw new Error('SHP/DBF not found in ZIP. Entries: ' + entries.map(e => e.entryName).join(', '))
  }
  console.log(`  Shapefile: ${shpEntry.entryName}`)

  const tmpDir = mkdtempSync(join(tmpdir(), 'vd-'))
  try {
    writeFileSync(join(tmpDir, 'data.shp'), shpEntry.getData())
    writeFileSync(join(tmpDir, 'data.dbf'), dbfEntry.getData())
    const col = await shapefile.read(join(tmpDir, 'data.shp'), join(tmpDir, 'data.dbf'), { encoding: 'UTF-8' })
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

  const districtResults = parseResults(resultsBuf, config)
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

  // Keep only Stockholm county (VD codes starting with "01")
  const stockholmFeatures = allFeatures.filter(f => f.properties.districtCode.startsWith('01'))
  console.log(`  Stockholm: ${stockholmFeatures.length} districts`)

  const geojson = { type: 'FeatureCollection', features: stockholmFeatures }
  const outPath = join(PUBLIC_DIR, `voting-districts-${year}.geojson`)
  writeFileSync(outPath, JSON.stringify(geojson))
  const mb = (Buffer.byteLength(JSON.stringify(geojson)) / 1024 / 1024).toFixed(1)
  console.log(`  Written: voting-districts-${year}.geojson (${mb} MB)`)
}

for (const year of [2018, 2014, 2010]) {
  await processYear(year)
}
console.log('\nAll done.')
