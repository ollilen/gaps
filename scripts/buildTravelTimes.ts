#!/usr/bin/env node
/**
 * Precomputes public transport travel times between every pair of DeSO areas in Stockholm stad,
 * plus from every DeSO to each fixed destination in scripts/travelTimeDestinations.json.
 *
 * Travel time for an origin/destination pair is the median door-to-door time over departures
 * every 5 minutes between 07:30 and 08:30 on a weekday, so a result doesn't hinge on catching
 * one particular bus. Door to door means: walk from the origin area's representative point to a
 * nearby stop, ride (with transfers), then walk from a stop to the destination point — or walk
 * the whole way, if that is faster.
 *
 * Data sources:
 *   Timetable: Trafiklab GTFS Regional, operator "sl" (CC0) — needs TRAFIKLAB_API_KEY in .env
 *   Boundaries: SCB GeoServer WFS — stat:DeSO_2025 and stat:RegSO_2025 (CC0)
 *
 * Outputs:
 *   public/deso-areas.geojson           DeSO polygons with matrixIndex and RegSO name
 *   public/travel-times.bin             origin × destination matrix (see src/domain/travelTime.ts)
 *   public/travel-time-destinations.json  minutes from every DeSO to each fixed destination
 *
 * Run: node --env-file=.env scripts/buildTravelTimes.ts [--use-cached-gtfs] [--date=YYYY-MM-DD]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import proj4 from 'proj4'
import { Just, Maybe, Nothing } from 'purify-ts/Maybe'
import { GtfsParser, StraightLineTransferGenerator, extendedGtfsProfile } from 'minotor/parser'
import { Query, Router, type StopsIndex } from 'minotor'
import { encodeTravelTimeMatrix, type Minutes } from '../src/domain/travelTime.ts'
import {
  doorToDoorMinutes,
  haversineMeters,
  medianMinutes,
  originPoint,
  walkingMinutes,
  type EgressLink,
  type Position,
  type Time,
} from '../src/domain/travelTimeEstimation.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = join(ROOT, 'public')
const GTFS_PATH = join(ROOT, '.cache', 'gtfs', 'sl.zip')
const DESTINATIONS_PATH = join(ROOT, 'scripts', 'travelTimeDestinations.json')

const STOCKHOLM_KOM = '0180'
const DEPARTURES: readonly Time[] = Array.from({ length: 13 }, (_, i) => 7 * 60 + 30 + i * 5)
// Beyond a kilometre, a stop is rarely the one people would actually walk to.
const MAX_STOP_DISTANCE_KM = 1.0
// Nearby stations are queried individually; past the nearest dozen, extra ones almost never win.
const MAX_ACCESS_STATIONS = 12
const MAX_JOURNEY_MINUTES = 150
const MAX_TRANSFERS = 5
const MAX_TRANSFER_WALK_METERS = 400

type DesoBoundary = {
  readonly desoCode: string
  readonly regsoCode: string
  readonly regsoName: string
  readonly geometry: Geometry
}

type DesoArea = DesoBoundary & { readonly point: Position }

type Geometry =
  | { readonly type: 'Polygon'; readonly coordinates: Position[][] }
  | { readonly type: 'MultiPolygon'; readonly coordinates: Position[][][] }

type FixedDestination = { readonly id: string; readonly label: string; readonly lng: number; readonly lat: number }

type AccessStop = { readonly stopId: number; readonly walkMinutes: Minutes }

// ── Input ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const useCachedGtfs = args.includes('--use-cached-gtfs')
const dateArg = args.find(a => a.startsWith('--date='))?.slice('--date='.length)

// Tuesday is a plain weekday: no Monday or Friday timetable quirks.
const nextTuesday = (from: Date): Date => {
  const date = new Date(from)
  date.setDate(date.getDate() + ((2 - date.getDay() + 7) % 7 || 7))
  date.setHours(12, 0, 0, 0)
  return date
}

const serviceDate = dateArg ? new Date(`${dateArg}T12:00:00`) : nextTuesday(new Date())

const downloadGtfs = async (): Promise<void> => {
  const key = process.env['TRAFIKLAB_API_KEY']
  if (!key) throw new Error('TRAFIKLAB_API_KEY is not set — run with --env-file=.env')
  process.stdout.write('  GTFS Regional (sl) ... ')
  const res = await fetch(`https://opendata.samtrafiken.se/gtfs/sl/sl.zip?key=${encodeURIComponent(key)}`)
  // Never echo the URL: it carries the API key.
  if (!res.ok) throw new Error(`GTFS download failed with HTTP ${res.status}`)
  mkdirSync(dirname(GTFS_PATH), { recursive: true })
  const bytes = Buffer.from(await res.arrayBuffer())
  writeFileSync(GTFS_PATH, bytes)
  console.log(`${(bytes.length / 1e6).toFixed(1)} MB`)
}

proj4.defs('SWEREF99TM', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')
const toWGS84 = proj4('SWEREF99TM', 'WGS84')

type NestedCoordinates = readonly number[] | readonly NestedCoordinates[]
const reproject = (coords: NestedCoordinates): NestedCoordinates =>
  typeof coords[0] === 'number'
    ? toWGS84.forward([coords[0], coords[1] as number]).map(c => Math.round(c * 1e6) / 1e6)
    : (coords as readonly NestedCoordinates[]).map(reproject)

type WfsFeature = { readonly properties: Record<string, string>; readonly geometry: Geometry }

const fetchWfsLayer = async (typeName: string): Promise<readonly WfsFeature[]> => {
  const url =
    'https://geodata.scb.se/geoserver/stat/wfs?service=WFS&version=2.0.0&request=GetFeature' +
    `&typeNames=${typeName}&outputFormat=application/json&CQL_FILTER=kommunkod='${STOCKHOLM_KOM}'`
  process.stdout.write(`  WFS ${typeName} (Stockholm stad) ... `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const { features } = (await res.json()) as { features: WfsFeature[] }
  console.log(`${features.length} features`)
  return features
}

const polygonsOf = (geometry: Geometry): Position[][][] =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

const fetchDesoBoundaries = async (): Promise<readonly DesoBoundary[]> => {
  const [desoFeatures, regsoFeatures] = await Promise.all([fetchWfsLayer('stat:DeSO_2025'), fetchWfsLayer('stat:RegSO_2025')])
  const regsoNames = new Map(regsoFeatures.map(f => [f.properties['regsokod'], f.properties['regsonamn'] ?? '']))
  return desoFeatures
    .map(f => {
      const geometry = { type: f.geometry.type, coordinates: reproject(f.geometry.coordinates) } as Geometry
      const regsoCode = f.properties['regsokod'] ?? ''
      return {
        desoCode: f.properties['desokod'] ?? '',
        regsoCode,
        regsoName: regsoNames.get(regsoCode) ?? '',
        geometry,
      }
    })
    .sort((a, b) => a.desoCode.localeCompare(b.desoCode))
}

// ── Stops near a point ───────────────────────────────────────────────────────

const toCoordinate = ([lng, lat]: Position) => ({ lng, lat })

const nearbyPlatforms = (stopsIndex: StopsIndex, point: Position) =>
  stopsIndex
    .findStopsByLocation(point[1], point[0], 500, MAX_STOP_DISTANCE_KM)
    .filter(stop => stop.locationType === 'SIMPLE_STOP_OR_PLATFORM' && stop.lat !== undefined && stop.lon !== undefined)
    .map(stop => ({
      stop,
      walkMinutes: walkingMinutes(haversineMeters(toCoordinate(point), { lng: stop.lon ?? 0, lat: stop.lat ?? 0 })),
    }))

type BoundingBox = readonly [minLng: number, minLat: number, maxLng: number, maxLat: number]

const boundingBox = (polygons: Position[][][]): BoundingBox => {
  const positions = polygons.flat(2)
  const lngs = positions.map(([lng]) => lng)
  const lats = positions.map(([, lat]) => lat)
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

const withinBox = ([minLng, minLat, maxLng, maxLat]: BoundingBox, [lng, lat]: Position): boolean =>
  lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat

const locateAreas = (boundaries: readonly DesoBoundary[], platforms: readonly Position[]): readonly DesoArea[] =>
  boundaries.map(boundary => {
    const polygons = polygonsOf(boundary.geometry)
    const box = boundingBox(polygons)
    return { ...boundary, point: originPoint(polygons, platforms.filter(p => withinBox(box, p))) }
  })

const egressLinks = (stopsIndex: StopsIndex, point: Position): readonly EgressLink[] =>
  nearbyPlatforms(stopsIndex, point).map(({ stop, walkMinutes }) => ({ stopId: stop.id, walkMinutes }))

// Platforms of one station share departures via minotor's sibling transfers, so querying from
// the nearest platform of each station is enough.
const accessStops = (stopsIndex: StopsIndex, point: Position): readonly AccessStop[] => {
  const nearestPerStation = nearbyPlatforms(stopsIndex, point).reduce((acc, { stop, walkMinutes }) => {
    const station = stop.parent ?? stop.id
    const current = acc.get(station)
    return current && current.walkMinutes <= walkMinutes ? acc : new Map(acc).set(station, { stopId: stop.id, walkMinutes })
  }, new Map<number, AccessStop>())
  return [...nearestPerStation.values()].sort((a, b) => a.walkMinutes - b.walkMinutes).slice(0, MAX_ACCESS_STATIONS)
}

// ── Routing ──────────────────────────────────────────────────────────────────

// For one origin and departure time: the earliest arrival at every stop any destination can be
// reached from, across all nearby boarding stops.
//
// minotor treats all stops sharing a parent station as interchangeable at zero cost, and SL's
// "stations" can span stops hundreds of metres apart (Kristineberg's metro and bus stops). A run
// therefore doesn't count as reaching its own station's stops — that would make neighbouring
// areas 0 minutes apart. Getting there means walking, which directWalk already covers.
const bestArrivals = (
  router: Router,
  stopsIndex: StopsIndex,
  access: readonly AccessStop[],
  departure: Time,
  egressUniverse: readonly number[],
): ReadonlyMap<number, Time> => {
  const runs = access.map(({ stopId, walkMinutes }) => ({
    ownStation: new Set([stopId, ...stopsIndex.equivalentStops(stopId).map(stop => stop.id)]),
    result: router.route(
      new Query.Builder()
        .from(stopId)
        .to(new Set())
        .departureTime(departure + walkMinutes)
        .maxTransfers(MAX_TRANSFERS)
        .maxDuration(MAX_JOURNEY_MINUTES)
        .build(),
    ),
  }))
  return new Map(
    egressUniverse.flatMap(stopId => {
      const arrivals = runs.flatMap(({ ownStation, result }) => {
        const arrival = ownStation.has(stopId) ? undefined : result.arrivalAt(stopId)
        return arrival ? [arrival.arrival] : []
      })
      return arrivals.length > 0 ? [[stopId, Math.min(...arrivals)] as const] : []
    }),
  )
}

const directWalk = (from: Position, to: Position): Maybe<Minutes> => {
  const minutes = walkingMinutes(haversineMeters(toCoordinate(from), toCoordinate(to)))
  return minutes <= MAX_JOURNEY_MINUTES ? Just(minutes) : Nothing
}

// ── Main ─────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('Fetching inputs')
  if (!(useCachedGtfs && existsSync(GTFS_PATH))) await downloadGtfs()
  const boundaries = await fetchDesoBoundaries()
  const destinations = JSON.parse(readFileSync(DESTINATIONS_PATH, 'utf8')) as readonly FixedDestination[]

  console.log(`Parsing timetable for ${serviceDate.toDateString()}`)
  const parser = new GtfsParser(
    GTFS_PATH,
    extendedGtfsProfile,
    new StraightLineTransferGenerator({ maxDistanceMeters: MAX_TRANSFER_WALK_METERS }),
  )
  const timetable = await parser.parseTimetable(serviceDate)
  const stopsIndex = await parser.parseStops()
  const router = new Router(timetable, stopsIndex)

  const [centerLng, centerLat] = [18.06, 59.33]
  const platforms = stopsIndex
    .findStopsByLocation(centerLat, centerLng, 100_000, 60)
    .filter(stop => stop.locationType === 'SIMPLE_STOP_OR_PLATFORM' && stop.lat !== undefined && stop.lon !== undefined)
    .map(stop => [stop.lon ?? 0, stop.lat ?? 0] as const)
  const areas = locateAreas(boundaries, platforms)

  const targetPoints: readonly Position[] = [...areas.map(a => a.point), ...destinations.map(d => [d.lng, d.lat] as const)]
  const targetEgress = targetPoints.map(point => egressLinks(stopsIndex, point))
  const egressUniverse = [...new Set(targetEgress.flatMap(links => links.map(l => l.stopId)))]

  console.log(`Routing ${areas.length} origins × ${DEPARTURES.length} departures to ${targetPoints.length} targets`)
  const started = performance.now()
  const rows = areas.map((origin, i) => {
    const access = accessStops(stopsIndex, origin.point)
    const perDeparture = DEPARTURES.map(departure => {
      const arrivals = bestArrivals(router, stopsIndex, access, departure, egressUniverse)
      const run = { arrivalAt: (stopId: number) => Maybe.fromNullable(arrivals.get(stopId)) }
      return targetPoints.map((target, j) =>
        doorToDoorMinutes({ departure, directWalk: directWalk(origin.point, target), runs: [run], egress: targetEgress[j] ?? [] }),
      )
    })
    if ((i + 1) % 25 === 0 || i === areas.length - 1) {
      const elapsed = (performance.now() - started) / 1000
      console.log(`  ${i + 1}/${areas.length} origins (${elapsed.toFixed(0)} s)`)
    }
    return targetPoints.map((_, j) => medianMinutes(perDeparture.map(minutes => minutes[j] ?? Nothing)))
  })

  const areaRows = rows.map((row, i) => row.slice(0, areas.length).map((m, j) => (i === j ? Just(0) : m)))
  const matrix = encodeTravelTimeMatrix(areaRows).caseOf({
    Left: error => {
      throw new Error(error.message)
    },
    Right: bytes => bytes,
  })

  writeFileSync(join(PUBLIC_DIR, 'travel-times.bin'), matrix)
  writeFileSync(
    join(PUBLIC_DIR, 'deso-areas.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      features: areas.map((area, matrixIndex) => ({
        type: 'Feature',
        geometry: area.geometry,
        properties: { desoCode: area.desoCode, regsoCode: area.regsoCode, regsoName: area.regsoName, matrixIndex },
      })),
    }),
  )
  writeFileSync(
    join(PUBLIC_DIR, 'travel-time-destinations.json'),
    JSON.stringify(
      destinations.map((destination, d) => ({
        ...destination,
        minutes: rows.map(row => (row[areas.length + d] ?? Nothing).map(Math.ceil).extractNullable()),
      })),
    ),
  )
  console.log(`Done: wrote ${areas.length} areas, ${(matrix.length / 1024).toFixed(0)} KB matrix, ${destinations.length} destination(s)`)
}

await main()
