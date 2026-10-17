import { describe, it, expect } from 'vitest'
import {
  cosineSimilarity,
  euclideanSimilarity,
  dotProduct,
  extractVector,
  magnitude,
  parseVector,
  rankBySimilarity,
  VECTOR_LENGTH,
  type DemographicVector,
  type StatisticalAreaProperties,
} from './statisticalArea'

const vec = (...args: number[]): DemographicVector => {
  const padded = Array.from({ length: VECTOR_LENGTH }, (_, i) => args[i] ?? 0)
  return padded as unknown as DemographicVector
}

const makeArea = (code: string, ...fv: number[]): StatisticalAreaProperties => ({
  samsCode: code,
  samsName: `Area ${code}`,
  meanIncome: 0,
  foreignBackgroundShare: 0,
  ageShare00_04: 0,
  ageShare05_09: 0,
  ageShare10_14: 0,
  ageShare15_19: 0,
  ageShare20_24: 0,
  ageShare25_29: 0,
  ageShare30_34: 0,
  ageShare35_39: 0,
  ageShare40_44: 0,
  ageShare45_49: 0,
  ageShare50_54: 0,
  ageShare55_59: 0,
  ageShare60_64: 0,
  ageShare65_69: 0,
  ageShare70_74: 0,
  ageShare75_79: 0,
  ageShare80Plus: 0,
  housingRentalShare: 0,
  housingOwnedShare: 0,
  housingHouseShare: 0,
  coupleWithChildrenShare: 0,
  coupleWithoutChildrenShare: 0,
  singleParentShare: 0,
  singlePersonShare: 0,
  otherHouseholdShare: 0,
  educationPreSecondaryShare: 0,
  educationSecondaryShare: 0,
  educationPostSecondaryShortShare: 0,
  educationPostSecondaryLongShare: 0,
  educationUnknownShare: 0,
  ...Object.fromEntries(Array.from({ length: VECTOR_LENGTH }, (_, i) => [`fv${i}`, fv[i] ?? 0])),
})

describe('dotProduct', () => {
  it('is zero for orthogonal vectors', () => {
    expect(dotProduct(vec(1), vec(0, 1))).toBe(0)
  })

  it('computes the sum of element-wise products', () => {
    expect(dotProduct(vec(1, 2), vec(3, 4))).toBe(11)
  })
})

describe('magnitude', () => {
  it('returns the Euclidean length', () => {
    expect(magnitude(vec(3, 4))).toBeCloseTo(5)
  })

  it('returns 0 for the zero vector', () => {
    expect(magnitude(vec())).toBe(0)
  })
})

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = vec(0.1, 0.2, 0.3, 0.1, 0.05, 0.5, 0.2, 0.6, 0.3, 0.4, 0.2)
    expect(cosineSimilarity(v, v)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(vec(1), vec(0, 1))).toBe(0)
  })

  it('returns 0 when either vector is zero', () => {
    expect(cosineSimilarity(vec(), vec(1))).toBe(0)
    expect(cosineSimilarity(vec(1), vec())).toBe(0)
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
    const zero = vec()
    const one = Array.from({ length: VECTOR_LENGTH }, () => 1) as unknown as DemographicVector
    expect(euclideanSimilarity(zero, one)).toBeCloseTo(0)
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
    const base = Array.from({ length: VECTOR_LENGTH }, () => 0.5) as unknown as DemographicVector
    const close = vec(0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5)
    const far = vec(0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5)
    expect(euclideanSimilarity(base, close)).toBeGreaterThan(euclideanSimilarity(base, far))
  })

  // Dimension groups, in fv0..fv30 order: age (fv0-16, 17 dims), income (fv17, 1 dim), foreign
  // background (fv18, 1 dim), housing (fv19-20, 2 dims), household (fv21-25, 5 dims),
  // education (fv26-30, 5 dims).
  it('weighs each category equally regardless of how many dimensions it has', () => {
    const zero = vec()
    const differsOnlyInAge = Array.from({ length: VECTOR_LENGTH }, (_, i) => (i <= 16 ? 1 : 0)) as unknown as DemographicVector
    const differsOnlyInIncome = Array.from({ length: VECTOR_LENGTH }, (_, i) => (i === 17 ? 1 : 0)) as unknown as DemographicVector
    const differsOnlyInHousehold = Array.from({ length: VECTOR_LENGTH }, (_, i) => (i >= 21 && i <= 25 ? 1 : 0)) as unknown as DemographicVector
    const differsOnlyInEducation = Array.from({ length: VECTOR_LENGTH }, (_, i) => (i >= 26 ? 1 : 0)) as unknown as DemographicVector

    const ageScore = euclideanSimilarity(zero, differsOnlyInAge)
    const incomeScore = euclideanSimilarity(zero, differsOnlyInIncome)
    const householdScore = euclideanSimilarity(zero, differsOnlyInHousehold)
    const educationScore = euclideanSimilarity(zero, differsOnlyInEducation)

    expect(ageScore).toBeCloseTo(incomeScore)
    expect(ageScore).toBeCloseTo(householdScore)
    expect(ageScore).toBeCloseTo(educationScore)
  })
})

describe('extractVector', () => {
  it(`reads fv0..fv${VECTOR_LENGTH - 1} in order`, () => {
    const components = Array.from({ length: VECTOR_LENGTH }, (_, i) => i / VECTOR_LENGTH)
    expect(extractVector(makeArea('A', ...components))).toEqual(components)
  })
})

describe('parseVector', () => {
  const validRaw = Object.fromEntries(Array.from({ length: VECTOR_LENGTH }, (_, i) => [`fv${i}`, i / VECTOR_LENGTH]))

  it(`returns Right for a valid record with ${VECTOR_LENGTH} finite numbers`, () => {
    expect(parseVector(validRaw).isRight()).toBe(true)
  })

  it('returns Left when a component is missing', () => {
    const raw = { fv0: 0.1, fv1: 0.2 }
    const result = parseVector(raw)
    expect(result.isLeft()).toBe(true)
    expect(result.extract()).toMatchObject({ kind: 'ParseError' })
  })

  it('returns Left when a component is not a number', () => {
    const result = parseVector({ ...validRaw, fv0: 'bad' })
    expect(result.isLeft()).toBe(true)
  })

  it('returns Left when a component is NaN', () => {
    const result = parseVector({ ...validRaw, fv0: NaN })
    expect(result.isLeft()).toBe(true)
  })
})

describe('rankBySimilarity', () => {
  it('excludes the selected area from results', () => {
    const areas = [makeArea('A', 1), makeArea('B', 0, 1)]
    const result = rankBySimilarity('A', vec(1), areas)
    expect(result.every(r => r.samsCode !== 'A')).toBe(true)
  })

  it('returns results sorted descending by score', () => {
    const areas = [makeArea('A', 1), makeArea('B', 0.9, 0.1), makeArea('C', 0, 1)]
    const result = rankBySimilarity('X', vec(1), areas)
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]?.score ?? 0).toBeGreaterThanOrEqual(result[i + 1]?.score ?? 0)
    }
  })

  it('returns an empty array when only the selected area is present', () => {
    const areas = [makeArea('A', 1)]
    expect(rankBySimilarity('A', vec(1), areas)).toHaveLength(0)
  })

  it('returns scores in [0, 1]', () => {
    const areas = [makeArea('B', 0.5, 0.5), makeArea('C', 0, 0, 1)]
    const result = rankBySimilarity('A', vec(1), areas)
    result.forEach(r => {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(1)
    })
  })
})
