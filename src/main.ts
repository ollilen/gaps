import { Map, type ExpressionSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection } from 'geojson'
import { stockholmMunicipalityColors, type MunicipalityColorMap } from './domain/municipality'
import { partyColors, type PartyCode } from './domain/election'
import type { LayerToggle } from './domain/layerToggle'
import { fetchStockholmMunicipalities } from './infrastructure/municipalities'
import { fetchVotingDistricts } from './infrastructure/votingDistricts'
import { MapControlsPanel } from './interface/mapControlsPanel'
import { PartyLegend } from './interface/partyLegend'
import './interface/mapControlsPanel.css'
import './interface/partyLegend.css'

const buildMunicipalityColorExpression = (colors: MunicipalityColorMap): ExpressionSpecification =>
  [
    'match',
    ['get', 'municipalityCode'],
    ...Object.entries(colors).flatMap(([code, color]) => [code, color]),
    '#cccccc',
  ] as unknown as ExpressionSpecification

const buildPartyColorExpression = (): ExpressionSpecification =>
  [
    'match',
    ['get', 'dominantParty'],
    ...Object.entries(partyColors).flatMap(([code, color]) => [code, color]),
    '#999999',
  ] as unknown as ExpressionSpecification

const municipalitiesToggle: LayerToggle = {
  id: 'municipalities',
  label: 'Municipalities',
  layerIds: ['municipalities-fill', 'municipalities-border'],
  defaultVisibility: 'visible',
}

const votingDistrictsToggle: LayerToggle = {
  id: 'voting-districts',
  label: 'Voting districts 2022',
  layerIds: ['voting-districts-fill', 'voting-districts-border'],
  defaultVisibility: 'none',
}

const legendPartyCodes: readonly PartyCode[] = ['S', 'M', 'SD', 'C', 'V', 'KD', 'L', 'MP']

const container = document.getElementById('map')
if (!container) throw new Error('Map container #map not found')

const map = new Map({
  container,
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
      },
    ],
  },
  center: [18.0686, 59.3293],
  zoom: 11,
})

map.addControl(new MapControlsPanel([municipalitiesToggle, votingDistrictsToggle]), 'top-right')
map.addControl(new PartyLegend(legendPartyCodes), 'bottom-right')

map.on('load', () => {
  void fetchStockholmMunicipalities()
    .run()
    .then(result =>
      result.caseOf({
        Left: err => console.error(`[municipalities] ${err.message}`),
        Right: geojson => {
          map.addSource('municipalities', { type: 'geojson', data: geojson as unknown as FeatureCollection })

          map.addLayer({
            id: 'municipalities-fill',
            type: 'fill',
            source: 'municipalities',
            layout: { visibility: municipalitiesToggle.defaultVisibility },
            paint: {
              'fill-color': buildMunicipalityColorExpression(stockholmMunicipalityColors),
              'fill-opacity': 0.45,
            },
          })

          map.addLayer({
            id: 'municipalities-border',
            type: 'line',
            source: 'municipalities',
            layout: { visibility: municipalitiesToggle.defaultVisibility },
            paint: {
              'line-color': '#ffffff',
              'line-width': 1.5,
            },
          })
        },
      }),
    )

  void fetchVotingDistricts()
    .then(geojson => {
      map.addSource('voting-districts', { type: 'geojson', data: geojson as unknown as FeatureCollection })

      map.addLayer({
        id: 'voting-districts-fill',
        type: 'fill',
        source: 'voting-districts',
        layout: { visibility: votingDistrictsToggle.defaultVisibility },
        paint: {
          'fill-color': buildPartyColorExpression(),
          'fill-opacity': 0.65,
        },
      })

      map.addLayer({
        id: 'voting-districts-border',
        type: 'line',
        source: 'voting-districts',
        layout: { visibility: votingDistrictsToggle.defaultVisibility },
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.5,
        },
      })
    })
    .catch((err: unknown) => console.error(`[voting-districts] ${err instanceof Error ? err.message : String(err)}`))
})
