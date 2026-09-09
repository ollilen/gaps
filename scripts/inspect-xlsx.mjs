import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'
import shapefile from 'shapefile'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dl = async (url) => {
  process.stdout.write(`DL ${url.split('/').pop()} ... `)
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`${(buf.length / 1024).toFixed(0)} KB`)
  return buf
}

const sampleShapefile = async (zipBuf, label) => {
  console.log(`\n=== ${label} shapefile ===`)
  const zip = new AdmZip(zipBuf)
  const entries = zip.getEntries()
  const shpEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.shp'))
  const dbfEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.dbf'))
  const tmpDir = mkdtempSync(join(tmpdir(), 'vd-'))
  try {
    writeFileSync(join(tmpDir, 'data.shp'), shpEntry.getData())
    writeFileSync(join(tmpDir, 'data.dbf'), dbfEntry.getData())
    const col = await shapefile.read(join(tmpDir, 'data.shp'), join(tmpDir, 'data.dbf'))
    console.log('Count:', col.features.length)
    console.log('Props:', JSON.stringify(col.features[0]?.properties))
  } finally {
    rmSync(tmpDir, { recursive: true })
  }
}

// 2018: get full header list
{
  console.log('\n=== 2018 full R antal headers ===')
  const buf = await dl('https://historik.val.se/val/val2018/statistik/2018_R_per_valdistrikt.xlsx')
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets['R antal']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  console.log('Headers:', JSON.stringify(rows[0]))
  console.log('Row 1:', JSON.stringify(rows[1]))
}

// 2014 boundary
await sampleShapefile(
  await dl('https://historik.val.se/val/val2014/statistik/gis/valgeografi_valdistrikt.zip'),
  '2014'
)

// 2010 boundary
await sampleShapefile(
  await dl('https://historik.val.se/val/val2010/statistik/gis/alla_valdistrikt.zip'),
  '2010'
)
