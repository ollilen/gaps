import { describe, it, expect } from 'vitest'
import { Just, Nothing, type Maybe } from 'purify-ts/Maybe'
import { decodeTravelTimeMatrix, encodeTravelTimeMatrix, type TravelTimeMatrix } from './travelTime'
import type { FixedDestination } from './fixedDestination'
import { areaCategory, minutesByArea, type TravelTimeMode } from './travelTimeView'

const matrixOf = (rows: readonly (readonly Maybe<number>[])[]): TravelTimeMatrix =>
  encodeTravelTimeMatrix(rows).chain(decodeTravelTimeMatrix).unsafeCoerce()

const matrix = matrixOf([
  [Just(0), Just(12), Just(75)],
  [Just(14), Just(0), Nothing],
  [Just(70), Just(45), Just(0)],
])

const hospital: FixedDestination = {
  id: 'hospital',
  label: 'Hospital',
  coordinate: { lng: 18, lat: 59 },
  minutes: [Just(20), Just(65), Nothing],
}

const reachable: TravelTimeMode = { kind: 'reachable' }
const toHospital: TravelTimeMode = { kind: 'toDestination', destination: hospital }

describe('minutesByArea', () => {
  it('gives the minutes from the selected origin to every area when showing reach', () => {
    expect(minutesByArea(matrix, reachable, Just(0))).toEqual([Just(0), Just(12), Just(75)])
  })

  it('gives no minutes when showing reach without a selected origin', () => {
    expect(minutesByArea(matrix, reachable, Nothing)).toEqual([Nothing, Nothing, Nothing])
  })

  it('gives the minutes from every area to the destination, regardless of any origin', () => {
    expect(minutesByArea(matrix, toHospital, Just(2))).toEqual(hospital.minutes)
  })
})

describe('areaCategory', () => {
  it('marks the selected origin when showing reach', () => {
    expect(areaCategory(reachable, 0, Just(0), Just(0))).toBe('origin')
  })

  it('bands areas reachable within the hour', () => {
    expect(areaCategory(reachable, 1, Just(0), Just(12))).toBe('upTo15')
    expect(areaCategory(reachable, 1, Just(0), Just(60))).toBe('upTo60')
  })

  it('leaves areas beyond the hour, or unreachable, outside the reach', () => {
    expect(areaCategory(reachable, 2, Just(0), Just(75))).toBe('outside')
    expect(areaCategory(reachable, 2, Just(1), Nothing)).toBe('outside')
  })

  it('bands every reachable area when showing time to a destination, including over an hour', () => {
    expect(areaCategory(toHospital, 0, Nothing, Just(20))).toBe('upTo30')
    expect(areaCategory(toHospital, 1, Nothing, Just(65))).toBe('over60')
    expect(areaCategory(toHospital, 2, Nothing, Nothing)).toBe('outside')
  })
})
