import type { Maybe } from 'purify-ts/Maybe'
import { travelMinutes, travelTimeBand, type Minutes, type TravelTimeBand, type TravelTimeMatrix } from './travelTime'
import type { FixedDestination } from './fixedDestination'

export type TravelTimeMode =
  | { readonly kind: 'reachable' }
  | { readonly kind: 'toDestination'; readonly destination: FixedDestination }

export type AreaCategory = TravelTimeBand | 'origin' | 'outside'

export const REACH_LIMIT_MINUTES = 60

export const minutesByArea = (
  matrix: TravelTimeMatrix,
  mode: TravelTimeMode,
  origin: Maybe<number>,
): readonly Maybe<Minutes>[] => {
  if (mode.kind === 'toDestination') return mode.destination.minutes
  return Array.from({ length: matrix.size }, (_, to) => origin.chain(from => travelMinutes(matrix, from, to)))
}

export const areaCategory = (
  mode: TravelTimeMode,
  index: number,
  origin: Maybe<number>,
  minutes: Maybe<Minutes>,
): AreaCategory => {
  if (mode.kind === 'reachable' && origin.extract() === index) return 'origin'
  return minutes
    .filter(m => mode.kind === 'toDestination' || m <= REACH_LIMIT_MINUTES)
    .map<AreaCategory>(travelTimeBand)
    .orDefault('outside')
}
