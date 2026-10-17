import { Either, Left, Right } from 'purify-ts/Either'
import { Just, Maybe, Nothing } from 'purify-ts/Maybe'
import { coordinate, type Coordinate } from './coordinates'
import type { Minutes } from './travelTime'

// A destination whose travel time from every area was precomputed, indexed like the matrix.
export type FixedDestination = {
  readonly id: string
  readonly label: string
  readonly coordinate: Coordinate
  readonly minutes: readonly Maybe<Minutes>[]
}

export type DestinationParseError = { readonly kind: 'DestinationParseError'; readonly message: string }

const destinationError = (message: string): DestinationParseError => ({ kind: 'DestinationParseError', message })

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const parseMinute = (value: unknown): Either<DestinationParseError, Maybe<Minutes>> => {
  if (value === null) return Right(Nothing)
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Right(Just(value))
  return Left(destinationError(`Invalid minutes value: ${String(value)}`))
}

const parseFixedDestination = (raw: unknown): Either<DestinationParseError, FixedDestination> => {
  if (!isRecord(raw)) return Left(destinationError('Destination is not an object'))
  const { id, label, lng, lat, minutes } = raw
  if (typeof id !== 'string' || typeof label !== 'string') return Left(destinationError('Destination needs an id and label'))
  if (typeof lng !== 'number' || typeof lat !== 'number') return Left(destinationError(`Destination ${id} needs lng/lat`))
  if (!Array.isArray(minutes)) return Left(destinationError(`Destination ${id} needs a minutes array`))
  return coordinate(lng, lat)
    .mapLeft(error => destinationError(error.message))
    .chain(coord =>
      Either.sequence(minutes.map(parseMinute)).map(parsed => ({ id, label, coordinate: coord, minutes: parsed })),
    )
}

export const parseFixedDestinations = (raw: unknown): Either<DestinationParseError, readonly FixedDestination[]> =>
  Array.isArray(raw)
    ? Either.sequence(raw.map(parseFixedDestination))
    : Left(destinationError('Destinations file is not an array'))
