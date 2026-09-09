import type { PartyCode } from '../domain/election'

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

// Source: Valmyndigheten, 2022 Riksdag election results per voting district.
// Pre-processed from XLSX + boundary JSON at build time; bundled as a static asset.
export const fetchVotingDistricts = async (): Promise<VotingDistrictFeatureCollection> => {
  const res = await fetch('/voting-districts-2022.geojson')
  if (!res.ok) throw new Error(`Failed to load voting districts: ${res.status}`)
  return res.json() as Promise<VotingDistrictFeatureCollection>
}
