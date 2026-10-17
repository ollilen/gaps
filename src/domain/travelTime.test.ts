import { describe, it, expect } from 'vitest'
import { Just, Nothing, type Maybe } from 'purify-ts/Maybe'
import {
  decodeTravelTimeMatrix,
  encodeTravelTimeMatrix,
  reachableFrom,
  timesTo,
  travelMinutes,
  travelTimeBand,
  type TravelTimeMatrix,
} from './travelTime'

const matrixOf = (rows: readonly (readonly Maybe<number>[])[]): TravelTimeMatrix =>
  encodeTravelTimeMatrix(rows).chain(decodeTravelTimeMatrix).unsafeCoerce()

const sample = matrixOf([
  [Just(0), Just(12), Nothing],
  [Just(14), Just(0), Just(61)],
  [Just(70), Just(45), Just(0)],
])

describe('encodeTravelTimeMatrix / decodeTravelTimeMatrix', () => {
  it('round-trips minutes and unreachable entries', () => {
    expect(sample.size).toBe(3)
    expect(travelMinutes(sample, 0, 1)).toEqual(Just(12))
    expect(travelMinutes(sample, 0, 2)).toEqual(Nothing)
    expect(travelMinutes(sample, 2, 0)).toEqual(Just(70))
  })

  it('caps minutes above the encodable range at 254 and rounds fractions up', () => {
    const matrix = matrixOf([[Just(0), Just(999)], [Just(3.2), Just(0)]])
    expect(travelMinutes(matrix, 0, 1)).toEqual(Just(254))
    expect(travelMinutes(matrix, 1, 0)).toEqual(Just(4))
  })

  it('rejects data without the expected header', () => {
    expect(decodeTravelTimeMatrix(new Uint8Array([1, 2, 3, 4, 5, 6])).isLeft()).toBe(true)
  })

  it('rejects data whose length does not match the declared size', () => {
    const bytes = encodeTravelTimeMatrix([[Just(0), Just(1)], [Just(1), Just(0)]]).unsafeCoerce()
    expect(decodeTravelTimeMatrix(bytes.slice(0, bytes.length - 1)).isLeft()).toBe(true)
  })

  it('refuses to encode a matrix that is not square', () => {
    expect(encodeTravelTimeMatrix([[Just(0)], [Just(1), Just(0)]]).isLeft()).toBe(true)
  })
})

describe('travelMinutes', () => {
  it('is Nothing for indices outside the matrix', () => {
    expect(travelMinutes(sample, 3, 0)).toEqual(Nothing)
    expect(travelMinutes(sample, 0, -1)).toEqual(Nothing)
  })
})

describe('reachableFrom', () => {
  it('lists destinations reachable within the limit, excluding the origin itself', () => {
    expect(reachableFrom(sample, 1, 60)).toEqual([{ index: 0, minutes: 14 }])
  })

  it('includes destinations exactly at the limit', () => {
    expect(reachableFrom(sample, 1, 61)).toEqual([
      { index: 0, minutes: 14 },
      { index: 2, minutes: 61 },
    ])
  })
})

describe('timesTo', () => {
  it('returns the travel time from every origin to one destination', () => {
    expect(timesTo(sample, 2)).toEqual([Nothing, Just(61), Just(0)])
  })
})

describe('travelTimeBand', () => {
  it.each([
    [0, 'upTo15'],
    [15, 'upTo15'],
    [16, 'upTo30'],
    [30, 'upTo30'],
    [45, 'upTo45'],
    [60, 'upTo60'],
    [61, 'over60'],
  ] as const)('puts %i minutes in %s', (minutes, band) => {
    expect(travelTimeBand(minutes)).toBe(band)
  })
})
