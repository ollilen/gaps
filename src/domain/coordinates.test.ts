import { describe, it, expect } from 'vitest'
import { coordinate } from './coordinates'

describe('coordinate', () => {
  it('returns a valid coordinate for in-range values', () => {
    const result = coordinate(18.0686, 59.3293)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ lng: 18.0686, lat: 59.3293 })
    }
  })

  it('rejects longitude below -180', () => {
    const result = coordinate(-181, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('InvalidCoordinate')
    }
  })

  it('rejects longitude above 180', () => {
    const result = coordinate(181, 0)
    expect(result.ok).toBe(false)
  })

  it('rejects latitude below -90', () => {
    const result = coordinate(0, -91)
    expect(result.ok).toBe(false)
  })

  it('rejects latitude above 90', () => {
    const result = coordinate(0, 91)
    expect(result.ok).toBe(false)
  })

  it('accepts boundary values', () => {
    expect(coordinate(-180, -90).ok).toBe(true)
    expect(coordinate(180, 90).ok).toBe(true)
  })
})
