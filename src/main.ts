import { Map, type ExpressionSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection } from 'geojson'
import { stockholmMunicipalityColors, type MunicipalityColorMap } from './domain/municipality'
import type { LayerToggle } from './domain/layerToggle'
import { fetchStockholmMunicipalities } from './infrastructure/municipalities'
import { MapControlsPanel } from './interface/mapControlsPanel'
import './interface/mapControlsPanel.css'

const buildColorExpression = (colors: MunicipalityColorMap): ExpressionSpecification =>
  [
    'match',
    ['get', 'municipalityCode'],
    ...Object.entries(colors).flatMap(([code, color]) => [code, color]),
    '#cccccc',
  ] as unknown as ExpressionSpecification

const municipalitiesToggle: LayerToggle = {
  id: 'municipalities',
  label: 'Municipalities',
  layerIds: ['municipalities-fill', 'municipalities-border'],
  defaultVisibility: 'visible',
}

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

map.addControl(new MapControlsPanel([municipalitiesToggle]), 'top-right')

map.on('load', async () => {
  const geojson = await fetchStockholmMunicipalities()

  map.addSource('municipalities', { type: 'geojson', data: geojson as unknown as FeatureCollection })

  map.addLayer({
    id: 'municipalities-fill',
    type: 'fill',
    source: 'municipalities',
    layout: {
      visibility: municipalitiesToggle.defaultVisibility,
    },
    paint: {
      'fill-color': buildColorExpression(stockholmMunicipalityColors),
      'fill-opacity': 0.45,
    },
  })

  map.addLayer({
    id: 'municipalities-border',
    type: 'line',
    source: 'municipalities',
    layout: {
      visibility: municipalitiesToggle.defaultVisibility,
    },
    paint: {
      'line-color': '#ffffff',
      'line-width': 1.5,
    },
  })
})
