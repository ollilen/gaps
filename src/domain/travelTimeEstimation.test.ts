import { describe, it, expect } from 'vitest'
import { Just, Nothing, type Maybe } from 'purify-ts/Maybe'
import {
  doorToDoorMinutes,
  haversineMeters,
  medianMinutes,
  originPoint,
  representativePoint,
  walkingMinutes,
  type AccessRun,
  type Position,
} from './travelTimeEstimation'

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lng: 18.06, lat: 59.33 }, { lng: 18.06, lat: 59.33 })).toBe(0)
  })

  it('measures one hundredth of a degree of latitude as roughly 1.11 km', () => {
    expect(haversineMeters({ lng: 18, lat: 59.3 }, { lng: 18, lat: 59.31 })).toBeCloseTo(1112, -1)
  })
})

describe('walkingMinutes', () => {
  it('applies a 1.3 detour factor at 5 km/h and rounds up', () => {
    // 1000 m * 1.3 = 1300 m at 83.33 m/min = 15.6 min
    expect(walkingMinutes(1000)).toBe(16)
  })

  it('is zero for zero distance', () => {
    expect(walkingMinutes(0)).toBe(0)
  })
})

describe('medianMinutes', () => {
  it('takes the middle value of an odd number of samples', () => {
    expect(medianMinutes([Just(30), Just(10), Just(20)])).toEqual(Just(20))
  })

  it('averages the two middle values of an even number of samples', () => {
    expect(medianMinutes([Just(10), Just(20), Just(30), Just(40)])).toEqual(Just(25))
  })

  it('counts unreachable samples as slower than any reachable one', () => {
    expect(medianMinutes([Nothing, Just(10), Nothing])).toEqual(Nothing)
    expect(medianMinutes([Nothing, Just(10), Just(12)])).toEqual(Just(12))
  })

  it('is Nothing when there are no samples', () => {
    expect(medianMinutes([])).toEqual(Nothing)
  })
})

describe('doorToDoorMinutes', () => {
  const runFrom = (arrivals: Readonly<Record<number, number>>): AccessRun => ({
    arrivalAt: (stopId): Maybe<number> => {
      const arrival = arrivals[stopId]
      return arrival === undefined ? Nothing : Just(arrival)
    },
  })

  it('adds the egress walk to the arrival at the destination stop', () => {
    const minutes = doorToDoorMinutes({
      departure: 480,
      directWalk: Nothing,
      runs: [runFrom({ 7: 500 })],
      egress: [{ stopId: 7, walkMinutes: 4 }],
    })
    expect(minutes).toEqual(Just(24))
  })

  it('picks the fastest combination of access run and egress stop', () => {
    const minutes = doorToDoorMinutes({
      departure: 480,
      directWalk: Nothing,
      runs: [runFrom({ 1: 510, 2: 505 }), runFrom({ 1: 498 })],
      egress: [
        { stopId: 1, walkMinutes: 2 },
        { stopId: 2, walkMinutes: 9 },
      ],
    })
    expect(minutes).toEqual(Just(20))
  })

  it('prefers walking all the way when that is faster', () => {
    const minutes = doorToDoorMinutes({
      departure: 480,
      directWalk: Just(11),
      runs: [runFrom({ 7: 500 })],
      egress: [{ stopId: 7, walkMinutes: 4 }],
    })
    expect(minutes).toEqual(Just(11))
  })

  it('is Nothing when no egress stop is reached and walking is not an option', () => {
    const minutes = doorToDoorMinutes({
      departure: 480,
      directWalk: Nothing,
      runs: [runFrom({ 7: 500 })],
      egress: [{ stopId: 8, walkMinutes: 4 }],
    })
    expect(minutes).toEqual(Nothing)
  })
})

describe('representativePoint', () => {
  const square: readonly Position[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ]

  it('uses the centroid when it lies inside the polygon', () => {
    expect(representativePoint([square])).toEqual([2, 2])
  })

  it('falls back to a point inside a concave polygon whose centroid lies outside', () => {
    // A "U" shape: the centroid sits in the empty notch between the arms.
    const uShape: readonly Position[] = [
      [0, 0],
      [6, 0],
      [6, 6],
      [5, 6],
      [5, 1],
      [1, 1],
      [1, 6],
      [0, 6],
      [0, 0],
    ]
    const [x, y] = representativePoint([uShape])
    const inLeftArm = x > 0 && x < 1 && y > 0 && y < 6
    const inRightArm = x > 5 && x < 6 && y > 0 && y < 6
    const inBase = x > 0 && x < 6 && y > 0 && y < 1
    expect(inLeftArm || inRightArm || inBase).toBe(true)
  })

  it('avoids holes', () => {
    const hole: readonly Position[] = [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
      [1, 1],
    ]
    const [x, y] = representativePoint([square, hole])
    const insideHole = x > 1 && x < 3 && y > 1 && y < 3
    expect(insideHole).toBe(false)
    expect(x > 0 && x < 4 && y > 0 && y < 4).toBe(true)
  })
})

describe('originPoint', () => {
  const square: readonly Position[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ]
  const farSquare: readonly Position[] = [
    [10, 0],
    [12, 0],
    [12, 2],
    [10, 2],
    [10, 0],
  ]

  it('averages the stops inside the area, ignoring stops outside it', () => {
    expect(originPoint([[square]], [[1, 1], [3, 1], [9, 9]])).toEqual([2, 1])
  })

  it('counts stops in every part of a multi-part area', () => {
    // Without the stop in the far part the average would be [2, 1]; with it, the average [5, 1]
    // falls between the parts, so the stop nearest to it is used.
    expect(originPoint([[square], [farSquare]], [[1, 1], [3, 1], [11, 1]])).toEqual([3, 1])
  })

  it('falls back to the representative point of the largest part when no stop is inside', () => {
    expect(originPoint([[farSquare], [square]], [[9, 9]])).toEqual([2, 2])
  })

  it('uses the stop nearest the average when the average lies outside the area', () => {
    // The average of the three stops, about [2.17, 4.67], lies in the notch between the arms.
    const uShape: readonly Position[] = [
      [0, 0],
      [6, 0],
      [6, 6],
      [5, 6],
      [5, 1],
      [1, 1],
      [1, 6],
      [0, 6],
      [0, 0],
    ]
    expect(originPoint([[uShape]], [[0.5, 5], [0.5, 4], [5.5, 5]])).toEqual([0.5, 5])
  })
})
