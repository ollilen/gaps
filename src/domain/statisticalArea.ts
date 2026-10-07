import { Either, Left, Right } from 'purify-ts/Either'

export type SamsCode = string

export type DemographicVector = readonly [
  number, // fv0: ageShare00_04
  number, // fv1: ageShare05_09
  number, // fv2: ageShare10_14
  number, // fv3: ageShare15_19
  number, // fv4: ageShare20_24
  number, // fv5: ageShare25_29
  number, // fv6: ageShare30_34
  number, // fv7: ageShare35_39
  number, // fv8: ageShare40_44
  number, // fv9: ageShare45_49
  number, // fv10: ageShare50_54
  number, // fv11: ageShare55_59
  number, // fv12: ageShare60_64
  number, // fv13: ageShare65_69
  number, // fv14: ageShare70_74
  number, // fv15: ageShare75_79
  number, // fv16: ageShare80Plus
  number, // fv17: meanIncome
  number, // fv18: foreignBackgroundShare
  number, // fv19: housingRentalShare
  number, // fv20: housingOwnedShare
  number, // fv21: coupleWithChildrenShare (SBMB households)
  number, // fv22: coupleWithoutChildrenShare (SBUB households)
  number, // fv23: singleParentShare (ESMB households)
  number, // fv24: singlePersonShare (ESUB households)
  number, // fv25: otherHouseholdShare (OVRIGA households)
  number, // fv26: educationPreSecondaryShare
  number, // fv27: educationSecondaryShare
  number, // fv28: educationPostSecondaryShortShare
  number, // fv29: educationPostSecondaryLongShare
  number, // fv30: educationUnknownShare
]

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
  readonly fv0: number
  readonly fv1: number
  readonly fv2: number
  readonly fv3: number
  readonly fv4: number
  readonly fv5: number
  readonly fv6: number
  readonly fv7: number
  readonly fv8: number
  readonly fv9: number
  readonly fv10: number
  readonly fv11: number
  readonly fv12: number
  readonly fv13: number
  readonly fv14: number
  readonly fv15: number
  readonly fv16: number
  readonly fv17: number
  readonly fv18: number
  readonly fv19: number
  readonly fv20: number
  readonly fv21: number
  readonly fv22: number
  readonly fv23: number
  readonly fv24: number
  readonly fv25: number
  readonly fv26: number
  readonly fv27: number
  readonly fv28: number
  readonly fv29: number
  readonly fv30: number
}

export type SimilarityScore = {
  readonly samsCode: SamsCode
  readonly samsName: string
  readonly score: number
}

export type ParseError = { readonly kind: 'ParseError'; readonly message: string }

export const extractVector = (props: StatisticalAreaProperties): DemographicVector =>
  [
    props.fv0, props.fv1, props.fv2, props.fv3, props.fv4, props.fv5, props.fv6, props.fv7,
    props.fv8, props.fv9, props.fv10, props.fv11, props.fv12, props.fv13, props.fv14, props.fv15,
    props.fv16, props.fv17, props.fv18, props.fv19, props.fv20, props.fv21, props.fv22, props.fv23,
    props.fv24, props.fv25, props.fv26, props.fv27, props.fv28, props.fv29, props.fv30,
  ]

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
  return Right(components as unknown as DemographicVector)
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
