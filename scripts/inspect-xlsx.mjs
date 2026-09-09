import readXlsxFile from 'read-excel-file/node'

const res = await fetch('https://historik.val.se/val/val2018/statistik/2018_R_per_valdistrikt.xlsx')
const buf = Buffer.from(await res.arrayBuffer())

const result = await readXlsxFile(buf, { sheet: 'R antal' })
console.log('type:', typeof result)
console.log('isArray:', Array.isArray(result))
console.log('length:', result?.length)
console.log('[0] isArray:', Array.isArray(result?.[0]))
console.log('[0]:', JSON.stringify(result?.[0])?.slice(0, 300))
console.log('[1]:', JSON.stringify(result?.[1])?.slice(0, 300))
