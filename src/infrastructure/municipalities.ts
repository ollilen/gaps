import { EitherAsync } from 'purify-ts/EitherAsync'
import { assetUrl } from './publicAssetUrl'
import { Left } from 'purify-ts/Either'

type Geometry = {
  readonly type: string
  readonly coordinates: readonly unknown[]
}

type MunicipalityFeature = {
  readonly type: 'Feature'
  readonly geometry: Geometry
  readonly properties: {
    readonly municipalityCode: string
    readonly municipalityName: string
  }
}

export type MunicipalityFeatureCollection = {
  readonly type: 'FeatureCollection'
  readonly features: readonly MunicipalityFeature[]
}

export type FetchError = { readonly kind: 'FetchError'; readonly message: string }

// Source: Lantmäteriet — Administrativ indelning (kommun-lan-rike), licensed CC BY 4.0.
// Pre-processed at build time via scripts/generate-municipalities.mjs and bundled as a static
// asset — see docs/DEPENDENCIES.md for the attribution requirement (surfaced in the map's
// attribution control in src/main.ts) and why this is a static asset rather than a live API call.
export const fetchStockholmMunicipalities = (): EitherAsync<FetchError, MunicipalityFeatureCollection> =>
  EitherAsync(async ({ liftEither }) => {
    const res = await fetch(assetUrl('municipalities.geojson'))
    if (!res.ok) {
      return liftEither(
        Left<FetchError, MunicipalityFeatureCollection>({
          kind: 'FetchError',
          message: `Failed to load municipality boundaries: ${res.status}`,
        }),
      )
    }
    return res.json() as Promise<MunicipalityFeatureCollection>
  })
