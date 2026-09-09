import { EitherAsync } from 'purify-ts/EitherAsync'
import { Left } from 'purify-ts/Either'
import type { StatisticalAreaProperties } from '../domain/statisticalArea'

type StatisticalAreaFeature = {
  readonly type: 'Feature'
  readonly geometry: {
    readonly type: 'Polygon' | 'MultiPolygon'
    readonly coordinates: readonly unknown[]
  }
  readonly properties: StatisticalAreaProperties
}

export type StatisticalAreaFeatureCollection = {
  readonly type: 'FeatureCollection'
  readonly features: readonly StatisticalAreaFeature[]
}

type FetchError = { readonly kind: 'FetchError'; readonly message: string }

// Source: SCB SAMS boundaries + demographic data for Stockholms stad.
// Pre-processed at build time; bundled as a static asset.
export const fetchStatisticalAreas = (): EitherAsync<FetchError, StatisticalAreaFeatureCollection> =>
  EitherAsync(async ({ liftEither }) => {
    const res = await fetch('/statistical-areas.geojson')
    if (!res.ok) {
      return liftEither(
        Left<FetchError, StatisticalAreaFeatureCollection>({
          kind: 'FetchError',
          message: `Failed to load statistical areas: ${res.status}`,
        }),
      )
    }
    return res.json() as Promise<StatisticalAreaFeatureCollection>
  })
