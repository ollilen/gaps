#!/usr/bin/env node
/**
 * Downloads Lantmäteriet's "Kommun, län och rike" GeoPackage (STAC catalog:
 * https://api.lantmateriet.se/stac-vektor/v1/collections/kommun-lan-rike) and
 * converts the kommun (municipality) layer to a static GeoJSON asset.
 *
 * Filtered to Stockholm county (lanskod "01") to match the rest of the app.
 *
 * Source: Lantmäteriet, "Administrativ indelning". Licensed CC BY 4.0 — see
 * docs/DEPENDENCIES.md for the attribution requirement (already wired up in
 * src/main.ts's map attribution control).
 *
 * The download requires HTTP Basic auth: set LANTMATERIET_USERNAME and
 * LANTMATERIET_PASSWORD (see .env.example) — these are build-time-only and
 * never shipped to the browser, unlike a VITE_-prefixed variable.
 *
 * Run: node --env-file=.env scripts/generate-municipalities.mjs
 */

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { unzipSync } from 'fflate'
import proj4 from 'proj4'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

const ASSET_URL =
  'https://dl1.lantmateriet.se/administrativ-indelning/kommun-lan-rike/kommun-lan-rike_aktuell.zip'
const STOCKHOLM_LAN_CODE = '01'

// SWEREF99 TM (EPSG:3006) → WGS84 (EPSG:4326) — same projection as scripts/generate-voting-districts.mjs
proj4.defs('SWEREF99TM', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')
const toWGS84 = proj4('SWEREF99TM', 'WGS84')

const reprojectRing = (ring) => ring.map(([x, y]) => toWGS84.forward([x, y]))
const reprojectPolygon = (polygon) => polygon.map(reprojectRing)
const reprojectMultiPolygon = (polygons) => polygons.map(reprojectPolygon)

// ── GeoPackage binary (GPB) geometry decoding ───────────────────────────────
// OGC GeoPackage spec §2.1.3: an 8-byte-or-larger header (magic "GP", version,
// flags, SRS id, optional envelope) followed by a standard ISO WKB geometry.
// No library dependency needed for this — @ngageoint/geopackage pulls in
// vulnerable transitive deps (file-type/image-size, for embedded raster tiles
// we don't use), so this is a deliberately minimal hand-rolled decoder scoped
// to exactly the (Multi)Polygon shapes this dataset contains.

const ENVELOPE_BYTE_LENGTH = [0, 32, 48, 48, 64]

const decodeGpbGeometry = (blob) => {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  const flags = view.getUint8(3)
  const envelopeIndicator = (flags >> 1) & 0x07
  const wkbOffset = 8 + (ENVELOPE_BYTE_LENGTH[envelopeIndicator] ?? 0)
  return decodeWKB(view, wkbOffset)
}

const decodeWKB = (view, offset) => {
  let pos = offset
  const littleEndian = view.getUint8(pos) === 1
  pos += 1
  const type = view.getUint32(pos, littleEndian)
  pos += 4

  const readUint32 = () => {
    const v = view.getUint32(pos, littleEndian)
    pos += 4
    return v
  }
  const readPoint = () => {
    const x = view.getFloat64(pos, littleEndian)
    const y = view.getFloat64(pos + 8, littleEndian)
    pos += 16
    return [x, y]
  }
  const readRing = () => Array.from({ length: readUint32() }, readPoint)
  const readPolygon = () => Array.from({ length: readUint32() }, readRing)

  if (type === 3) return { type: 'Polygon', coordinates: reprojectPolygon(readPolygon()) }
  if (type === 6) {
    const count = readUint32()
    const polygons = Array.from({ length: count }, () => {
      pos += 1 // sub-geometry byte-order byte (assumed consistent with parent)
      const subType = readUint32()
      if (subType !== 3) throw new Error(`Unexpected sub-geometry type in MultiPolygon: ${subType}`)
      return readPolygon()
    })
    return { type: 'MultiPolygon', coordinates: reprojectMultiPolygon(polygons) }
  }
  throw new Error(`Unsupported WKB geometry type: ${type}`)
}

// ── Main ─────────────────────────────────────────────────────────────────

const username = process.env.LANTMATERIET_USERNAME
const password = process.env.LANTMATERIET_PASSWORD
if (!username || !password) {
  throw new Error('Set LANTMATERIET_USERNAME and LANTMATERIET_PASSWORD (see .env.example)')
}

console.log(`DL ${ASSET_URL}`)
const res = await fetch(ASSET_URL, {
  headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` },
})
if (!res.ok) throw new Error(`HTTP ${res.status} downloading GeoPackage`)
const zipBuf = Buffer.from(await res.arrayBuffer())
console.log(`  ${(zipBuf.length / 1024 / 1024).toFixed(1)} MB`)

const files = unzipSync(new Uint8Array(zipBuf))
const gpkgKey = Object.keys(files).find((k) => k.toLowerCase().endsWith('.gpkg'))
if (!gpkgKey) throw new Error('No .gpkg file found in ZIP. Files: ' + Object.keys(files).join(', '))

const tmpDir = mkdtempSync(join(tmpdir(), 'kommun-'))
const gpkgPath = join(tmpDir, 'data.gpkg')
try {
  writeFileSync(gpkgPath, Buffer.from(files[gpkgKey]))

  const db = new DatabaseSync(gpkgPath, { readOnly: true })
  const rows = db
    .prepare('SELECT geometri, kommunkod, namnkortform FROM kommun WHERE lanskod = ?')
    .all(STOCKHOLM_LAN_CODE)
  db.close()

  console.log(`  ${rows.length} municipalities in Stockholm county`)

  const features = rows.map((row) => ({
    type: 'Feature',
    geometry: decodeGpbGeometry(Buffer.from(row.geometri)),
    properties: {
      municipalityCode: row.kommunkod,
      municipalityName: row.namnkortform,
    },
  }))

  const geojson = { type: 'FeatureCollection', features }
  const outPath = join(PUBLIC_DIR, 'municipalities.geojson')
  const json = JSON.stringify(geojson)
  writeFileSync(outPath, json)
  console.log(`Written: municipalities.geojson (${(Buffer.byteLength(json) / 1024).toFixed(0)} KB)`)
} finally {
  rmSync(tmpDir, { recursive: true })
}
