import { Map as MapLibreMap, Popup, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FeatureCollection } from 'geojson'
import { stockholmMunicipalityColors, type MunicipalityColorMap } from './domain/municipality'
import { partyColors, type PartyCode } from './domain/election'
import type { LayerToggle } from './domain/layerToggle'
import { fetchStockholmMunicipalities } from './infrastructure/municipalities'
import { fetchVotingDistricts, votingDistrictYears, type VotingDistrictYear } from './infrastructure/votingDistricts'
import { MapControlsPanel } from './interface/mapControlsPanel'
import { buildPartyLegend } from './interface/partyLegend'
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
  label: 'Voting districts',
  layerIds: ['voting-districts-fill', 'voting-districts-border'],
  defaultVisibility: 'none',
}

const legendPartyCodes: readonly PartyCode[] = ['S', 'M', 'SD', 'C', 'V', 'KD', 'L', 'MP']

const container = document.getElementById('map')
if (!container) throw new Error('Map container #map not found')

// maplibre-gl resolves its worker script from import.meta.url at runtime, which Rollup can't
// statically analyze — so the worker file never gets emitted into the production build and tile
// parsing silently fails (blank map, no console error). `?worker&url` makes Vite bundle it as a
// self-contained worker chunk (it isn't standalone — it imports a sibling maplibre-gl-shared.mjs
// by relative path, which a plain `?url` copy would leave unresolved/404) and gives us the
// resulting URL. Must run before any Map is constructed.
setWorkerUrl(maplibreWorkerUrl)

const map = new MapLibreMap({
  container,
  // OpenFreeMap (Liberty style): free, no API key, no rate limits, permits production/commercial
  // use. See docs/DEPENDENCIES.md. Do not point this back at tile.openstreetmap.org — that
  // server is for light testing only and will throttle/drop requests from a deployed app.
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [18.0686, 59.3293],
  zoom: 11,
})

const loadVotingDistricts = (year: VotingDistrictYear): void => {
  void fetchVotingDistricts(year)
    .run()
    .then(result =>
      result.caseOf({
        Left: err => console.error(`[voting-districts] ${err.message}`),
        Right: geojson => {
          const source = map.getSource('voting-districts') as GeoJSONSource | undefined
          source?.setData(geojson as unknown as FeatureCollection)
        },
      }),
    )
}

const buildVotingDistrictsSubPanel = (): HTMLElement => {
  const panel = document.createElement('div')
  panel.className = 'map-controls-panel__sub-panel'

  const yearRow = document.createElement('div')
  yearRow.className = 'map-controls-panel__sub-panel-row'

  const yearLabel = document.createElement('label')
  yearLabel.textContent = 'Year'

  const yearSelect = document.createElement('select')
  yearSelect.className = 'map-controls-panel__year-select'
  votingDistrictYears.forEach(year => {
    const option = document.createElement('option')
    option.value = String(year)
    option.textContent = String(year)
    yearSelect.appendChild(option)
  })
  yearSelect.addEventListener('change', () => {
    loadVotingDistricts(Number(yearSelect.value) as VotingDistrictYear)
  })

  yearRow.appendChild(yearLabel)
  yearRow.appendChild(yearSelect)
  panel.appendChild(yearRow)
  panel.appendChild(buildPartyLegend(legendPartyCodes))

  return panel
}

const subPanels = new Map([[votingDistrictsToggle.id, buildVotingDistrictsSubPanel()]])

map.addControl(new MapControlsPanel([municipalitiesToggle, votingDistrictsToggle], subPanels, 'radio'), 'top-right')

const tooltip = new Popup({ closeButton: false, closeOnClick: false })

map.on('load', () => {
  void fetchStockholmMunicipalities()
    .run()
    .then(result =>
      result.caseOf({
        Left: err => console.error(`[municipalities] ${err.message}`),
        Right: geojson => {
          map.addSource('municipalities', {
            type: 'geojson',
            data: geojson as unknown as FeatureCollection,
            attribution: 'Administrativ indelning © Lantmäteriet, CC BY 4.0',
          })

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

          map.on('mousemove', 'municipalities-fill', e => {
            const name = e.features?.[0]?.properties?.municipalityName as string | undefined
            if (!name) return
            map.getCanvas().style.cursor = 'pointer'
            tooltip.setLngLat(e.lngLat).setText(name).addTo(map)
          })
          map.on('mouseleave', 'municipalities-fill', () => {
            map.getCanvas().style.cursor = ''
            tooltip.remove()
          })
        },
      }),
    )

  void fetchVotingDistricts(votingDistrictYears[0])
    .run()
    .then(result =>
      result.caseOf({
        Left: err => console.error(`[voting-districts] ${err.message}`),
        Right: geojson => {
          map.addSource('voting-districts', {
            type: 'geojson',
            data: geojson as unknown as FeatureCollection,
            attribution: 'Election results: Valmyndigheten',
          })

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

          map.on('mousemove', 'voting-districts-fill', e => {
            const name = e.features?.[0]?.properties?.districtName as string | undefined
            if (!name) return
            map.getCanvas().style.cursor = 'pointer'
            tooltip.setLngLat(e.lngLat).setText(name).addTo(map)
          })
          map.on('mouseleave', 'voting-districts-fill', () => {
            map.getCanvas().style.cursor = ''
            tooltip.remove()
          })
        },
      }),
    )
})
