import { describe, it, expect } from 'vitest'
import { publicAssetUrl } from './publicAssetUrl'

describe('publicAssetUrl', () => {
  it('resolves a file against the root base', () => {
    expect(publicAssetUrl('/', 'municipalities.geojson')).toBe('/municipalities.geojson')
  })

  it('resolves a file against a sub-path base such as GitHub Pages', () => {
    expect(publicAssetUrl('/gaps/', 'municipalities.geojson')).toBe('/gaps/municipalities.geojson')
  })

  it('tolerates a base without a trailing slash', () => {
    expect(publicAssetUrl('/gaps', 'travel-times.bin')).toBe('/gaps/travel-times.bin')
  })

  it('tolerates a file with a leading slash', () => {
    expect(publicAssetUrl('/gaps/', '/travel-times.bin')).toBe('/gaps/travel-times.bin')
  })
})
