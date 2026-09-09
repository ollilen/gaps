import { Either, Left, Right } from 'purify-ts/Either'

export type SamsCode = string

export type DemographicVector = readonly [
  number, // fv0: ageShare0_17
  number, // fv1: ageShare18_29
  number, // fv2: ageShare30_44
  number, // fv3: ageShare45_64
  number, // fv4: ageShare65plus
  number, // fv5: medianIncome
  number, // fv6: foreignBackgroundShare
  number, // fv7: housingRentalShare
  number, // fv8: housingOwnedShare
  number, // fv9: singlePersonShare (ESUB households)
  number, // fv10: familyWithChildrenShare (SBMB + ESMB households)
]

export const VECTOR_LENGTH = 11 as const

// Maximum possible Euclidean distance in [0,1]^VECTOR_LENGTH space: sqrt(VECTOR_LENGTH)
const MAX_EUCLIDEAN_DISTANCE = Math.sqrt(VECTOR_LENGTH)

export type StatisticalAreaProperties = {
  readonly samsCode: SamsCode
  readonly samsName: string
  readonly medianIncome: number
  readonly foreignBackgroundShare: number
  readonly ageShare0_17: number
  readonly ageShare18_29: number
  readonly ageShare30_44: number
  readonly ageShare45_64: number
  readonly ageShare65plus: number
  readonly housingRentalShare: number
  readonly housingOwnedShare: number
  readonly housingHouseShare: number
  readonly singlePersonShare: number
  readonly familyWithChildrenShare: number
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
}

export type SimilarityScore = {
  readonly samsCode: SamsCode
  readonly samsName: string
  readonly score: number
}

export type ParseError = { readonly kind: 'ParseError'; readonly message: string }

export const extractVector = (props: StatisticalAreaProperties): DemographicVector =>
  [props.fv0, props.fv1, props.fv2, props.fv3, props.fv4, props.fv5, props.fv6, props.fv7, props.fv8, props.fv9, props.fv10]

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

// Euclidean similarity: 1 - distance / max_distance, giving a score in [0,1].
// More discriminating than cosine on all-positive min-max-normalised vectors.
export const euclideanSimilarity = (a: DemographicVector, b: DemographicVector): number => {
  const dist = Math.sqrt(a.reduce((sum, ai, i) => sum + (ai - (b[i] ?? 0)) ** 2, 0))
  return 1 - dist / MAX_EUCLIDEAN_DISTANCE
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
