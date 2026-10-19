import { Just, Maybe, Nothing } from 'purify-ts/Maybe'
import type { Coordinate } from './coordinates'
import type { Minutes } from './travelTime'

// Minutes from midnight, matching the GTFS timetable's time unit.
export type Time = number

// [lng, lat], the GeoJSON position order.
export type Position = readonly [number, number]

// Absolute transit arrival times at every reachable stop, for a journey that left the origin at
// the departure time and walked to a nearby boarding stop first.
export type AccessRun = {
  readonly arrivalAt: (stopId: number) => Maybe<Time>
}

export type EgressLink = { readonly stopId: number; readonly walkMinutes: Minutes }

export type DoorToDoorInput = {
  readonly departure: Time
  readonly directWalk: Maybe<Minutes>
  readonly runs: readonly AccessRun[]
  readonly egress: readonly EgressLink[]
}

const EARTH_RADIUS_METERS = 6_371_000
// Streets rarely run straight to the stop; 1.3 is a common straight-line-to-network ratio for
// dense urban grids.
const WALK_DETOUR_FACTOR = 1.3
const WALK_METERS_PER_MINUTE = 5000 / 60

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

export const haversineMeters = (a: Coordinate, b: Coordinate): number => {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

export const walkingMinutes = (distanceMeters: number): Minutes =>
  Math.ceil((distanceMeters * WALK_DETOUR_FACTOR) / WALK_METERS_PER_MINUTE)

// Unreachable samples sort as infinitely slow, so an area reachable on fewer than half of the
// sampled departures comes out unreachable rather than as its lucky best case.
export const medianMinutes = (samples: readonly Maybe<Minutes>[]): Maybe<Minutes> => {
  if (samples.length === 0) return Nothing
  const sorted = samples.map(s => s.orDefault(Infinity)).sort((a, b) => a - b)
  const upper = sorted[Math.floor(sorted.length / 2)] ?? Infinity
  const lower = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] ?? Infinity) : upper
  const median = (lower + upper) / 2
  return Number.isFinite(median) ? Just(median) : Nothing
}

const minimum = (values: readonly Maybe<number>[]): Maybe<number> =>
  values.reduce<Maybe<number>>(
    (best, value) => value.map(v => best.map(b => Math.min(b, v)).orDefault(v)).alt(best),
    Nothing,
  )

export const doorToDoorMinutes = ({ departure, directWalk, runs, egress }: DoorToDoorInput): Maybe<Minutes> => {
  const viaTransit = runs.flatMap(run =>
    egress.map(link => run.arrivalAt(link.stopId).map(arrival => arrival + link.walkMinutes - departure)),
  )
  return minimum([directWalk, ...viaTransit])
}

const ringCentroid = (ring: readonly Position[]): Position => {
  const edges = ring.slice(0, -1).map((p, i) => [p, ring[i + 1] ?? p] as const)
  const { area2, cx, cy } = edges.reduce(
    (acc, [[x0, y0], [x1, y1]]) => {
      const cross = x0 * y1 - x1 * y0
      return { area2: acc.area2 + cross, cx: acc.cx + (x0 + x1) * cross, cy: acc.cy + (y0 + y1) * cross }
    },
    { area2: 0, cx: 0, cy: 0 },
  )
  return area2 === 0 ? (ring[0] ?? [0, 0]) : [cx / (3 * area2), cy / (3 * area2)]
}

const crossings = (ring: readonly Position[], y: number): readonly number[] =>
  ring.slice(0, -1).flatMap(([x0, y0], i) => {
    const [x1, y1] = ring[i + 1] ?? [x0, y0]
    const spans = (y0 <= y && y < y1) || (y1 <= y && y < y0)
    return spans ? [x0 + ((y - y0) / (y1 - y0)) * (x1 - x0)] : []
  })

const insidePolygon = (rings: readonly (readonly Position[])[], [x, y]: Position): boolean =>
  rings.flatMap(ring => crossings(ring, y)).filter(cx => cx > x).length % 2 === 1

// Travel times are measured from one point per area, so that point must actually lie in the
// area: a concave area's centroid can sit in a neighbouring area or in water. When it does, take
// the middle of the widest stretch of the polygon along the centroid's latitude instead.
export const representativePoint = (rings: readonly (readonly Position[])[]): Position => {
  const centroid = ringCentroid(rings[0] ?? [])
  if (insidePolygon(rings, centroid)) return centroid

  const y = centroid[1]
  const xs = rings.flatMap(ring => crossings(ring, y)).slice().sort((a, b) => a - b)
  const segments = xs.flatMap((x, i) => (i % 2 === 0 ? [[x, xs[i + 1] ?? x] as const] : []))
  const widest = segments.reduce((best, s) => (s[1] - s[0] > best[1] - best[0] ? s : best), segments[0] ?? [0, 0])
  return [(widest[0] + widest[1]) / 2, y]
}

const polygonArea = (rings: readonly (readonly Position[])[]): number => {
  const ring = rings[0] ?? []
  return Math.abs(
    ring.slice(0, -1).reduce((sum, [x0, y0], i) => {
      const [x1, y1] = ring[i + 1] ?? [x0, y0]
      return sum + x0 * y1 - x1 * y0
    }, 0),
  )
}

const squaredDistance = ([x0, y0]: Position, [x1, y1]: Position): number => (x1 - x0) ** 2 + (y1 - y0) ** 2

// The point travel times are measured from. Stops sit where people live, while a DeSO's geometric
// centre can land in a lake or forest — SCB's boundaries along the shore extend into the water.
// So the average position of the area's stops is used, snapped to the nearest stop if the
// average falls outside the area; only areas without stops fall back to the geometric point.
export const originPoint = (
  polygons: readonly (readonly (readonly Position[])[])[],
  stops: readonly Position[],
): Position => {
  const inArea = (point: Position): boolean => polygons.some(rings => insidePolygon(rings, point))
  const stopsInside = stops.filter(inArea)
  if (stopsInside.length === 0) {
    const largest = polygons.reduce((best, p) => (polygonArea(p) > polygonArea(best) ? p : best), polygons[0] ?? [])
    return representativePoint(largest)
  }
  const sum = stopsInside.reduce<Position>(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0])
  const average: Position = [sum[0] / stopsInside.length, sum[1] / stopsInside.length]
  return inArea(average)
    ? average
    : stopsInside.reduce((best, stop) => (squaredDistance(stop, average) < squaredDistance(best, average) ? stop : best))
}
