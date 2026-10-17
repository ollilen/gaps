import { Either, Left, Right } from 'purify-ts/Either'

export type SamsCode = string

// Branded rather than spelled out as a 31-element tuple: the brand still means a vector can only
// come from parseVector/extractVector (which fix its length at VECTOR_LENGTH), and the component
// layout is described once, above CATEGORY_DIMENSION_COUNTS, instead of twice.
export type DemographicVector = readonly number[] & { readonly __brand: 'DemographicVector' }

export const VECTOR_LENGTH = 31 as const

// Dimension groups in fv0..fv30 order: age brackets (17), mean income (1), foreign background
// (1), housing tenure shares (2), household type shares (5), education level shares (5).
// Weighting every raw dimension equally would let age, household type, and education - which
// happen to be broken into many sub-dimensions - dominate the similarity score over categories
// represented by just one or two dimensions, like income. Weighting each category equally
// instead means a difference in income counts as much toward the score as a difference across
// the entire age profile.
const CATEGORY_DIMENSION_COUNTS = [17, 1, 1, 2, 5, 5] as const
const CATEGORY_COUNT = CATEGORY_DIMENSION_COUNTS.length

// Each dimension's weight is 1 / (number of categories * dimensions in its category), so every
// category's weights sum to 1/CATEGORY_COUNT and all weights together sum to 1.
const DIMENSION_WEIGHTS: readonly number[] = CATEGORY_DIMENSION_COUNTS.flatMap(size =>
  Array.from({ length: size }, () => 1 / (CATEGORY_COUNT * size)),
)

// Flattened as fv0..fv30 because GeoJSON properties handed back by MapLibre on click are
// flat scalars; parseVector validates the actual count.
type FeatureVectorProperties = { readonly [key: `fv${number}`]: number }

export type StatisticalAreaProperties = {
  readonly samsCode: SamsCode
  readonly samsName: string
  readonly meanIncome: number
  readonly foreignBackgroundShare: number
  readonly ageShare00_04: number
  readonly ageShare05_09: number
  readonly ageShare10_14: number
  readonly ageShare15_19: number
  readonly ageShare20_24: number
  readonly ageShare25_29: number
  readonly ageShare30_34: number
  readonly ageShare35_39: number
  readonly ageShare40_44: number
  readonly ageShare45_49: number
  readonly ageShare50_54: number
  readonly ageShare55_59: number
  readonly ageShare60_64: number
  readonly ageShare65_69: number
  readonly ageShare70_74: number
  readonly ageShare75_79: number
  readonly ageShare80Plus: number
  readonly housingRentalShare: number
  readonly housingOwnedShare: number
  readonly housingHouseShare: number
  readonly coupleWithChildrenShare: number
  readonly coupleWithoutChildrenShare: number
  readonly singleParentShare: number
  readonly singlePersonShare: number
  readonly otherHouseholdShare: number
  readonly educationPreSecondaryShare: number
  readonly educationSecondaryShare: number
  readonly educationPostSecondaryShortShare: number
  readonly educationPostSecondaryLongShare: number
  readonly educationUnknownShare: number
} & FeatureVectorProperties

export type SimilarityScore = {
  readonly samsCode: SamsCode
  readonly samsName: string
  readonly score: number
}

export type ParseError = { readonly kind: 'ParseError'; readonly message: string }

const toVector = (components: readonly number[]): DemographicVector =>
  components as DemographicVector

export const extractVector = (props: StatisticalAreaProperties): DemographicVector =>
  toVector(Array.from({ length: VECTOR_LENGTH }, (_, i) => props[`fv${i}`] ?? 0))

export const dotProduct = (a: DemographicVector, b: DemographicVector): number =>
  a.reduce((sum, ai, i) => sum + ai * (b[i] ?? 0), 0)

export const magnitude = (v: DemographicVector): number =>
  Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))

export const cosineSimilarity = (a: DemographicVector, b: DemographicVector): number => {
  const magA = magnitude(a)
  const magB = magnitude(b)
  if (magA === 0 || magB === 0) return 0
  return dotProduct(a, b) / (magA * magB)
}

// Euclidean similarity: 1 - weighted distance, giving a score in [0,1]. Dimensions are weighted
// by category (see DIMENSION_WEIGHTS) rather than equally, so categories with many sub-dimensions
// don't dominate categories with few. Since the weights sum to 1 and both vectors are in
// [0,1]^VECTOR_LENGTH, the weighted squared distance is itself bounded in [0,1].
// More discriminating than cosine on all-positive min-max-normalised vectors.
export const euclideanSimilarity = (a: DemographicVector, b: DemographicVector): number => {
  const weightedSquaredDistance = a.reduce(
    (sum, ai, i) => sum + (DIMENSION_WEIGHTS[i] ?? 0) * (ai - (b[i] ?? 0)) ** 2,
    0,
  )
  return 1 - Math.sqrt(weightedSquaredDistance)
}

export const parseVector = (
  raw: Record<string, unknown>,
): Either<ParseError, DemographicVector> => {
  const components: number[] = []
  for (let i = 0; i < VECTOR_LENGTH; i++) {
    const val = raw[`fv${i}`]
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return Left({ kind: 'ParseError', message: `Missing or invalid fv${i}` })
    }
    components.push(val)
  }
  return Right(toVector(components))
}

export const rankBySimilarity = (
  selectedCode: SamsCode,
  selectedVector: DemographicVector,
  allAreas: readonly StatisticalAreaProperties[],
): readonly SimilarityScore[] =>
  allAreas
    .filter(area => area.samsCode !== selectedCode)
    .map(area => ({
      samsCode: area.samsCode,
      samsName: area.samsName,
      score: euclideanSimilarity(selectedVector, extractVector(area)),
    }))
    .sort((a, b) => b.score - a.score)
