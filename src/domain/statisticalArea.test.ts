import { describe, it, expect } from 'vitest'
import {
  cosineSimilarity,
  euclideanSimilarity,
  dotProduct,
  magnitude,
  parseVector,
  rankBySimilarity,
  type DemographicVector,
  type StatisticalAreaProperties,
} from './statisticalArea'

const vec = (...args: number[]): DemographicVector => args as unknown as DemographicVector

const makeArea = (code: string, ...fv: number[]): StatisticalAreaProperties => ({
  samsCode: code,
  samsName: `Area ${code}`,
  medianIncome: 0,
  foreignBackgroundShare: 0,
  ageShare0_17: 0,
  ageShare18_29: 0,
  ageShare30_44: 0,
  ageShare45_64: 0,
  ageShare65plus: 0,
  housingRentalShare: 0,
  housingOwnedShare: 0,
  housingHouseShare: 0,
  singlePersonShare: 0,
  familyWithChildrenShare: 0,
  fv0: fv[0] ?? 0,
  fv1: fv[1] ?? 0,
  fv2: fv[2] ?? 0,
  fv3: fv[3] ?? 0,
  fv4: fv[4] ?? 0,
  fv5: fv[5] ?? 0,
  fv6: fv[6] ?? 0,
  fv7: fv[7] ?? 0,
  fv8: fv[8] ?? 0,
  fv9: fv[9] ?? 0,
  fv10: fv[10] ?? 0,
})

describe('dotProduct', () => {
  it('is zero for orthogonal vectors', () => {
    expect(dotProduct(vec(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), vec(0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe(0)
  })

  it('computes the sum of element-wise products', () => {
    expect(dotProduct(vec(1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0), vec(3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe(11)
  })
})

describe('magnitude', () => {
  it('returns the Euclidean length', () => {
    expect(magnitude(vec(3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBeCloseTo(5)
  })

  it('returns 0 for the zero vector', () => {
    expect(magnitude(vec(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe(0)
  })
})

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = vec(0.1, 0.2, 0.3, 0.1, 0.05, 0.5, 0.2, 0.6, 0.3, 0.4, 0.2)
    expect(cosineSimilarity(v, v)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(
      cosineSimilarity(vec(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), vec(0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
    ).toBe(0)
  })

  it('returns 0 when either vector is zero', () => {
    expect(
      cosineSimilarity(vec(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), vec(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
    ).toBe(0)
    expect(
      cosineSimilarity(vec(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), vec(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
    ).toBe(0)
  })

  it('is commutative', () => {
    const a = vec(0.1, 0.5, 0.2, 0.1, 0.1, 0.8, 0.3, 0.4, 0.3, 0.5, 0.2)
    const b = vec(0.2, 0.4, 0.1, 0.2, 0.1, 0.6, 0.2, 0.5, 0.2, 0.3, 0.4)
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a))
  })

  it('returns a value in [0, 1] for non-negative vectors', () => {
    const a = vec(0.3, 0.2, 0.1, 0.1, 0.05, 0.9, 0.4, 0.7, 0.2, 0.5, 0.2)
    const b = vec(0.1, 0.4, 0.3, 0.05, 0.1, 0.5, 0.3, 0.4, 0.5, 0.2, 0.3)
    const score = cosineSimilarity(a, b)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe('euclideanSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = vec(0.1, 0.2, 0.3, 0.1, 0.05, 0.5, 0.2, 0.6, 0.3, 0.4, 0.2)
    expect(euclideanSimilarity(v, v)).toBeCloseTo(1)
  })

  it('returns 0 for maximally different vectors', () => {
    expect(euclideanSimilarity(vec(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), vec(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1))).toBeCloseTo(0)
  })

  it('is symmetric', () => {
    const a = vec(0.1, 0.5, 0.2, 0.3, 0.1, 0.8, 0.3, 0.4, 0.3, 0.5, 0.2)
    const b = vec(0.2, 0.4, 0.1, 0.1, 0.2, 0.6, 0.2, 0.5, 0.2, 0.3, 0.4)
    expect(euclideanSimilarity(a, b)).toBeCloseTo(euclideanSimilarity(b, a))
  })

  it('returns a value in [0, 1] for vectors in [0,1] space', () => {
    const a = vec(0.3, 0.2, 0.1, 0.1, 0.05, 0.9, 0.4, 0.7, 0.2, 0.5, 0.2)
    const b = vec(0.1, 0.4, 0.3, 0.05, 0.1, 0.5, 0.3, 0.4, 0.5, 0.2, 0.3)
    const score = euclideanSimilarity(a, b)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('scores a closer area higher than a farther one', () => {
    const base  = vec(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5)
    const close = vec(0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5)
    const far   = vec(0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5)
    expect(euclideanSimilarity(base, close)).toBeGreaterThan(euclideanSimilarity(base, far))
  })
})

describe('parseVector', () => {
  it('returns Right for a valid record with 11 finite numbers', () => {
    const raw = { fv0: 0.1, fv1: 0.2, fv2: 0.3, fv3: 0.1, fv4: 0.1, fv5: 0.5, fv6: 0.2, fv7: 0.6, fv8: 0.2, fv9: 0.4, fv10: 0.3 }
    expect(parseVector(raw).isRight()).toBe(true)
  })

  it('returns Left when a component is missing', () => {
    const raw = { fv0: 0.1, fv1: 0.2 }
    const result = parseVector(raw)
    expect(result.isLeft()).toBe(true)
    expect(result.extract()).toMatchObject({ kind: 'ParseError' })
  })

  it('returns Left when a component is not a number', () => {
    const raw = { fv0: 'bad', fv1: 0.2, fv2: 0.3, fv3: 0.1, fv4: 0.1, fv5: 0.5, fv6: 0.2, fv7: 0.6, fv8: 0.2, fv9: 0.4, fv10: 0.3 }
    expect(parseVector(raw).isLeft()).toBe(true)
  })

  it('returns Left when a component is NaN', () => {
    const raw = { fv0: NaN, fv1: 0.2, fv2: 0.3, fv3: 0.1, fv4: 0.1, fv5: 0.5, fv6: 0.2, fv7: 0.6, fv8: 0.2, fv9: 0.4, fv10: 0.3 }
    expect(parseVector(raw).isLeft()).toBe(true)
  })
})

describe('rankBySimilarity', () => {
  it('excludes the selected area from results', () => {
    const areas = [makeArea('A', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), makeArea('B', 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0)]
    const result = rankBySimilarity('A', vec(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), areas)
    expect(result.every(r => r.samsCode !== 'A')).toBe(true)
  })

  it('returns results sorted descending by score', () => {
    const areas = [
      makeArea('A', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
      makeArea('B', 0.9, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0),
      makeArea('C', 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    ]
    const result = rankBySimilarity('X', vec(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), areas)
    for (let i = 0; i < result.length - 1; i++) {
      expect((result[i]?.score ?? 0)).toBeGreaterThanOrEqual(result[i + 1]?.score ?? 0)
    }
  })

  it('returns an empty array when only the selected area is present', () => {
    const areas = [makeArea('A', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)]
    expect(rankBySimilarity('A', vec(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), areas)).toHaveLength(0)
  })

  it('returns scores in [0, 1]', () => {
    const areas = [makeArea('B', 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0), makeArea('C', 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0)]
    const result = rankBySimilarity('A', vec(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), areas)
    result.forEach(r => {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(1)
    })
  })
})
