import { describe, it, expect } from 'vitest'
import { coordinate } from './coordinates'

describe('coordinate', () => {
  it('returns a valid coordinate for in-range values', () => {
    const result = coordinate(18.0686, 59.3293)
    expect(result.isRight()).toBe(true)
    expect(result.extract()).toEqual({ lng: 18.0686, lat: 59.3293 })
  })

  it('rejects longitude below -180', () => {
    const result = coordinate(-181, 0)
    expect(result.isLeft()).toBe(true)
    expect(result.extract()).toMatchObject({ kind: 'InvalidCoordinate' })
  })

  it('rejects longitude above 180', () => {
    expect(coordinate(181, 0).isLeft()).toBe(true)
  })

  it('rejects latitude below -90', () => {
    expect(coordinate(0, -91).isLeft()).toBe(true)
  })

  it('rejects latitude above 90', () => {
    expect(coordinate(0, 91).isLeft()).toBe(true)
  })

  it('accepts boundary values', () => {
    expect(coordinate(-180, -90).isRight()).toBe(true)
    expect(coordinate(180, 90).isRight()).toBe(true)
  })
})
