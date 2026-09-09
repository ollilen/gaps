import { EitherAsync } from 'purify-ts/EitherAsync'
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

type ApiRecord = {
  readonly kom_code: readonly string[]
  readonly kom_name: readonly string[]
  readonly geo_shape: {
    readonly geometry: Geometry
  }
}

export type FetchError = { readonly kind: 'FetchError'; readonly message: string }

// Source: OpenDataSoft — georef-sweden-kommun (boundaries from Lantmäteriet)
export const fetchStockholmMunicipalities = (): EitherAsync<FetchError, MunicipalityFeatureCollection> =>
  EitherAsync(async ({ liftEither }) => {
    const params = new URLSearchParams({
      select: 'kom_code,kom_name,geo_shape',
      where: "lan_code='01'",
      limit: '30',
    })

    const res = await fetch(
      `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-sweden-kommun/records?${params}`,
    )

    if (!res.ok) {
      return liftEither(
        Left<FetchError, MunicipalityFeatureCollection>({
          kind: 'FetchError',
          message: `Failed to fetch municipality boundaries: ${res.status}`,
        }),
      )
    }

    const data: { results: readonly ApiRecord[] } = await res.json()

    return {
      type: 'FeatureCollection',
      features: data.results.map(record => ({
        type: 'Feature',
        geometry: record.geo_shape.geometry,
        properties: {
          municipalityCode: record.kom_code[0] ?? '',
          municipalityName: record.kom_name[0] ?? '',
        },
      })),
    }
  })
