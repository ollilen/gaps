import { EitherAsync } from 'purify-ts/EitherAsync'
import { assetUrl } from './publicAssetUrl'
import { decodeTravelTimeMatrix, type TravelTimeMatrix } from '../domain/travelTime'
import { parseFixedDestinations, type FixedDestination } from '../domain/fixedDestination'

type DesoAreaFeature = {
  readonly type: 'Feature'
  readonly geometry: {
    readonly type: 'Polygon' | 'MultiPolygon'
    readonly coordinates: readonly unknown[]
  }
  readonly properties: {
    readonly desoCode: string
    readonly regsoCode: string
    readonly regsoName: string
    readonly matrixIndex: number
  }
}

export type DesoAreaFeatureCollection = {
  readonly type: 'FeatureCollection'
  readonly features: readonly DesoAreaFeature[]
}

export type FetchError = { readonly kind: 'FetchError'; readonly message: string }

const fetchError = (message: string): FetchError => ({ kind: 'FetchError', message })

const fetchOk = (path: string, what: string): EitherAsync<FetchError, Response> =>
  EitherAsync(async ({ throwE }) => {
    const res = await fetch(path)
    return res.ok ? res : throwE(fetchError(`Failed to load ${what}: ${res.status}`))
  })

// Source: Trafiklab GTFS Regional (SL) + SCB DeSO boundaries, both CC0. Precomputed at build time
// by scripts/buildTravelTimes.ts and bundled as static assets — see docs/DEPENDENCIES.md for why
// this isn't a live routing API.
export const fetchDesoAreas = (): EitherAsync<FetchError, DesoAreaFeatureCollection> =>
  fetchOk(assetUrl('deso-areas.geojson'), 'DeSO areas').map(res => res.json() as Promise<DesoAreaFeatureCollection>)

export const fetchTravelTimeMatrix = (): EitherAsync<FetchError, TravelTimeMatrix> =>
  fetchOk(assetUrl('travel-times.bin'), 'travel times').chain(res =>
    EitherAsync(async ({ liftEither }) =>
      liftEither(
        decodeTravelTimeMatrix(new Uint8Array(await res.arrayBuffer())).mapLeft(error => fetchError(error.message)),
      ),
    ),
  )

export const fetchFixedDestinations = (): EitherAsync<FetchError, readonly FixedDestination[]> =>
  fetchOk(assetUrl('travel-time-destinations.json'), 'travel time destinations').chain(res =>
    EitherAsync(async ({ liftEither }) =>
      liftEither(parseFixedDestinations(await res.json()).mapLeft(error => fetchError(error.message))),
    ),
  )
