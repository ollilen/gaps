import { EitherAsync } from 'purify-ts/EitherAsync'
import { Left } from 'purify-ts/Either'
import type { PartyCode } from '../domain/election'

export const votingDistrictYears = [2022, 2018, 2014, 2010, 2006, 2002, 1998, 1994, 1991, 1988] as const
export type VotingDistrictYear = (typeof votingDistrictYears)[number]

type VotingDistrictProperties = {
  readonly districtCode: string
  readonly districtName: string
  readonly dominantParty: PartyCode
}

type VotingDistrictFeature = {
  readonly type: 'Feature'
  readonly geometry: {
    readonly type: 'Polygon' | 'MultiPolygon'
    readonly coordinates: readonly unknown[]
  }
  readonly properties: VotingDistrictProperties
}

export type VotingDistrictFeatureCollection = {
  readonly type: 'FeatureCollection'
  readonly features: readonly VotingDistrictFeature[]
}

type FetchError = { readonly kind: 'FetchError'; readonly message: string }

// Source: Valmyndigheten, election results per voting district.
// Pre-processed from XLSX + boundary JSON at build time; bundled as a static asset.
export const fetchVotingDistricts = (year: VotingDistrictYear): EitherAsync<FetchError, VotingDistrictFeatureCollection> =>
  EitherAsync(async ({ liftEither }) => {
    const res = await fetch(`/voting-districts-${year}.geojson`)
    if (!res.ok) {
      return liftEither(
        Left<FetchError, VotingDistrictFeatureCollection>({
          kind: 'FetchError',
          message: `Failed to load voting districts: ${res.status}`,
        }),
      )
    }
    return res.json() as Promise<VotingDistrictFeatureCollection>
  })
