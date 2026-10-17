import { Either, Left, Right } from 'purify-ts/Either'
import { Just, Maybe, Nothing } from 'purify-ts/Maybe'

export type Minutes = number

// One byte per origin/destination pair keeps ~570² DeSO pairs around 320 KB. Journeys longer
// than 254 minutes are irrelevant for a one-hour reach map, so they are capped rather than
// widening the format.
export type TravelTimeMatrix = {
  readonly size: number
  readonly minutes: Uint8Array
}

export type TravelTimeBand = 'upTo15' | 'upTo30' | 'upTo45' | 'upTo60' | 'over60'

export type MatrixCodecError = { readonly kind: 'MatrixCodecError'; readonly message: string }

export type ReachableArea = { readonly index: number; readonly minutes: Minutes }

const UNREACHABLE = 255
const MAX_ENCODABLE_MINUTES = 254
const MAGIC = [0x47, 0x54, 0x54, 0x31] as const // "GTT1"
const HEADER_LENGTH = MAGIC.length + 2

const codecError = (message: string): MatrixCodecError => ({ kind: 'MatrixCodecError', message })

const encodeMinutes = (minutes: Maybe<Minutes>): number =>
  minutes.map(m => Math.min(Math.ceil(m), MAX_ENCODABLE_MINUTES)).orDefault(UNREACHABLE)

export const encodeTravelTimeMatrix = (
  rows: readonly (readonly Maybe<Minutes>[])[],
): Either<MatrixCodecError, Uint8Array> => {
  const size = rows.length
  if (rows.some(row => row.length !== size)) return Left(codecError('Matrix is not square'))
  if (size > 0xffff) return Left(codecError(`Matrix size ${size} exceeds 65535`))

  const header = [...MAGIC, size & 0xff, size >> 8]
  const body = rows.flatMap(row => row.map(encodeMinutes))
  return Right(Uint8Array.from([...header, ...body]))
}

export const decodeTravelTimeMatrix = (bytes: Uint8Array): Either<MatrixCodecError, TravelTimeMatrix> => {
  if (bytes.length < HEADER_LENGTH || MAGIC.some((b, i) => bytes[i] !== b)) {
    return Left(codecError('Missing travel time matrix header'))
  }
  const size = (bytes[4] ?? 0) | ((bytes[5] ?? 0) << 8)
  const expectedLength = HEADER_LENGTH + size * size
  if (bytes.length !== expectedLength) {
    return Left(codecError(`Expected ${expectedLength} bytes for size ${size}, got ${bytes.length}`))
  }
  return Right({ size, minutes: bytes.subarray(HEADER_LENGTH) })
}

const isIndex = (matrix: TravelTimeMatrix, i: number): boolean => Number.isInteger(i) && i >= 0 && i < matrix.size

export const travelMinutes = (matrix: TravelTimeMatrix, from: number, to: number): Maybe<Minutes> => {
  if (!isIndex(matrix, from) || !isIndex(matrix, to)) return Nothing
  const value = matrix.minutes[from * matrix.size + to]
  return value === undefined || value === UNREACHABLE ? Nothing : Just(value)
}

const indices = (matrix: TravelTimeMatrix): readonly number[] => Array.from({ length: matrix.size }, (_, i) => i)

export const reachableFrom = (
  matrix: TravelTimeMatrix,
  origin: number,
  maxMinutes: Minutes,
): readonly ReachableArea[] =>
  indices(matrix)
    .filter(index => index !== origin)
    .flatMap(index =>
      travelMinutes(matrix, origin, index)
        .filter(minutes => minutes <= maxMinutes)
        .map(minutes => [{ index, minutes }])
        .orDefault([]),
    )

export const timesTo = (matrix: TravelTimeMatrix, destination: number): readonly Maybe<Minutes>[] =>
  indices(matrix).map(origin => travelMinutes(matrix, origin, destination))

export const travelTimeBand = (minutes: Minutes): TravelTimeBand => {
  if (minutes <= 15) return 'upTo15'
  if (minutes <= 30) return 'upTo30'
  if (minutes <= 45) return 'upTo45'
  if (minutes <= 60) return 'upTo60'
  return 'over60'
}
