import {
  Map as MapLibreMap,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FeatureCollection } from 'geojson'
import { stockholmMunicipalityColors, type MunicipalityColorMap } from './domain/municipality'
import { partyColors, type PartyCode } from './domain/election'
import type { LayerToggle } from './domain/layerToggle'
import {
  parseVector,
  rankBySimilarity,
  type SamsCode,
  type StatisticalAreaProperties,
} from './domain/statisticalArea'
import { fetchStockholmMunicipalities } from './infrastructure/municipalities'
import { fetchVotingDistricts, votingDistrictYears, type VotingDistrictYear } from './infrastructure/votingDistricts'
import {
  fetchStatisticalAreas,
  type StatisticalAreaFeatureCollection,
} from './infrastructure/statisticalAreas'
import { Just, Maybe, Nothing } from 'purify-ts/Maybe'
import { reachableFrom, type TravelTimeMatrix } from './domain/travelTime'
import type { FixedDestination } from './domain/fixedDestination'
import { areaCategory, minutesByArea, REACH_LIMIT_MINUTES, type TravelTimeMode } from './domain/travelTimeView'
import {
  fetchDesoAreas,
  fetchFixedDestinations,
  fetchTravelTimeMatrix,
  type DesoAreaFeatureCollection,
} from './infrastructure/travelTimes'
import { MapControlsPanel } from './interface/mapControlsPanel'
import { buildPartyLegend } from './interface/partyLegend'
import { buildSimilarityPanel, updateSimilarityPanel } from './interface/similarityPanel'
import { buildTravelTimePanel, travelTimeCategoryColors, updateTravelTimeStatus } from './interface/travelTimePanel'
import './interface/mapControlsPanel.css'
import './interface/partyLegend.css'
import './interface/similarityPanel.css'
import './interface/travelTimePanel.css'

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

const travelTimeToggle: LayerToggle = {
  id: 'travel-time',
  label: 'Travel time (public transport)',
  layerIds: ['travel-time-fill', 'travel-time-border', 'travel-time-destination'],
  defaultVisibility: 'visible',
}

const municipalitiesToggle: LayerToggle = {
  id: 'municipalities',
  label: 'Municipalities',
  layerIds: ['municipalities-fill', 'municipalities-border'],
  defaultVisibility: 'none',
}

const votingDistrictsToggle: LayerToggle = {
  id: 'voting-districts',
  label: 'Voting districts',
  layerIds: ['voting-districts-fill', 'voting-districts-border'],
  defaultVisibility: 'none',
}

const statisticalAreasToggle: LayerToggle = {
  id: 'statistical-areas',
  label: 'Demographic similarity',
  layerIds: ['statistical-areas-fill', 'statistical-areas-border'],
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
setWorkerUrl(mapLibreWorkerUrl)

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

const similarityPanel = buildSimilarityPanel()

const applySimilarityScores = (
  source: GeoJSONSource,
  base: StatisticalAreaFeatureCollection,
  scores: ReadonlyMap<SamsCode, number>,
  selectedCode: SamsCode | null,
  topMatchCode: SamsCode | null,
): void => {
  const updated = {
    ...base,
    features: base.features.map(f => {
      const code = f.properties.samsCode
      const score = scores.get(code) ?? 0
      const displayCategory =
        code === selectedCode
          ? 'selected'
          : selectedCode === null
            ? 'neutral'
            : code === topMatchCode
              ? 'topMatch'
              : 'top10'
      return {
        ...f,
        properties: { ...f.properties, similarityScore: score, displayCategory },
      }
    }),
  }
  source.setData(updated as unknown as FeatureCollection)
}

// Filled in once the travel time data has loaded: the mode options depend on which fixed
// destinations were precomputed, but the controls panel has to exist before the map loads.
const travelTimeSubPanel = document.createElement('div')
travelTimeSubPanel.className = 'map-controls-panel__sub-panel'
travelTimeSubPanel.textContent = 'Loading…'

const subPanels = new Map([
  [travelTimeToggle.id, travelTimeSubPanel],
  [votingDistrictsToggle.id, buildVotingDistrictsSubPanel()],
  [statisticalAreasToggle.id, similarityPanel],
])

const disclaimer = document.createElement('p')
disclaimer.className = 'map-controls-panel__disclaimer'
disclaimer.textContent =
  'Boundaries and results may be incomplete or contain errors — please verify anything important elsewhere. No responsibility is taken for mistakes. This is a personal side project, made for fun.'

map.addControl(
  new MapControlsPanel(
    [travelTimeToggle, municipalitiesToggle, votingDistrictsToggle, statisticalAreasToggle],
    subPanels,
    'radio',
    disclaimer,
  ),
  'top-right',
)

const tooltip = new Popup({ closeButton: false, closeOnClick: false })

const travelTimeColorExpression = (): ExpressionSpecification =>
  [
    'match',
    ['coalesce', ['feature-state', 'category'], 'outside'],
    ...Object.entries(travelTimeCategoryColors).flatMap(([category, color]) => [category, color]),
    travelTimeCategoryColors.outside,
  ] as unknown as ExpressionSpecification

const REACHABLE_MODE_ID = 'reachable'
const DEFAULT_MODE_ID = 'sodersjukhuset'

const setUpTravelTime = (
  areas: DesoAreaFeatureCollection,
  matrix: TravelTimeMatrix,
  destinations: readonly FixedDestination[],
): void => {
  const regsoNames = new Map(areas.features.map(f => [f.properties.matrixIndex, f.properties.regsoName] as const))

  map.addSource('travel-time-areas', {
    type: 'geojson',
    data: areas as unknown as FeatureCollection,
    promoteId: 'matrixIndex',
    attribution: 'Timetable: Trafiklab/Samtrafiken',
  })
  map.addSource('travel-time-destinations', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: destinations.map(d => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.coordinate.lng, d.coordinate.lat] },
        properties: { id: d.id, label: d.label },
      })),
    },
  })

  map.addLayer({
    id: 'travel-time-fill',
    type: 'fill',
    source: 'travel-time-areas',
    layout: { visibility: travelTimeToggle.defaultVisibility },
    paint: {
      'fill-color': travelTimeColorExpression(),
      'fill-opacity': [
        'case',
        ['==', ['coalesce', ['feature-state', 'category'], 'outside'], 'outside'],
        0.15,
        0.7,
      ] as unknown as ExpressionSpecification,
    },
  })
  map.addLayer({
    id: 'travel-time-border',
    type: 'line',
    source: 'travel-time-areas',
    layout: { visibility: travelTimeToggle.defaultVisibility },
    paint: { 'line-color': '#ffffff', 'line-width': 0.4 },
  })
  map.addLayer({
    id: 'travel-time-destination',
    type: 'circle',
    source: 'travel-time-destinations',
    layout: { visibility: travelTimeToggle.defaultVisibility },
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': 7,
      'circle-color': '#f59e0b',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  })

  // Which mode is shown and which area is the origin are the only state that changes after
  // load; both are scoped to this set-up rather than held at module level.
  const modeFor = (id: string): TravelTimeMode =>
    Maybe.fromNullable(destinations.find(d => d.id === id))
      .map<TravelTimeMode>(destination => ({ kind: 'toDestination', destination }))
      .orDefault({ kind: 'reachable' })

  let mode: TravelTimeMode = modeFor(DEFAULT_MODE_ID)
  let origin: Maybe<number> = Nothing

  const statusText = (): string => {
    if (mode.kind === 'toDestination') {
      return `Median weekday morning trip (07:30–08:30) to ${mode.destination.label}`
    }
    return origin
      .map(from => {
        const count = reachableFrom(matrix, from, REACH_LIMIT_MINUTES).length
        return `${regsoNames.get(from) ?? 'Selected area'}: ${count} of ${matrix.size - 1} areas within 1 h`
      })
      .orDefault('Click an area to see how far you get in an hour')
  }

  const render = (): void => {
    minutesByArea(matrix, mode, origin).forEach((minutes, index) => {
      map.setFeatureState(
        { source: 'travel-time-areas', id: index },
        { category: areaCategory(mode, index, origin, minutes), minutes: minutes.extractNullable() },
      )
    })
    const destinationId = mode.kind === 'toDestination' ? mode.destination.id : ''
    map.setFilter('travel-time-destination', ['==', ['get', 'id'], destinationId] as FilterSpecification)
    updateTravelTimeStatus(panel, statusText())
  }

  const selectMode = (id: string): void => {
    mode = modeFor(id)
    render()
  }

  const panel = buildTravelTimePanel(
    [
      { id: REACHABLE_MODE_ID, label: 'Reachable within 1 h from a clicked area' },
      ...destinations.map(d => ({ id: d.id, label: `Time to ${d.label}` })),
    ],
    selectMode,
    mode.kind === 'toDestination' ? mode.destination.id : REACHABLE_MODE_ID,
  )
  travelTimeSubPanel.replaceChildren(panel)

  map.on('mousemove', 'travel-time-fill', e => {
    const id = e.features?.[0]?.id
    if (typeof id !== 'number') return
    const minutes = Maybe.fromNullable(map.getFeatureState({ source: 'travel-time-areas', id })['minutes'] as number | null)
    const showsMinutes = mode.kind === 'toDestination' || origin.isJust()
    const detail = showsMinutes ? minutes.map(m => ` · ${m} min`).orDefault(' · no connection') : ''
    map.getCanvas().style.cursor = 'pointer'
    tooltip.setLngLat(e.lngLat).setText(`${regsoNames.get(id) ?? ''}${detail}`).addTo(map)
  })
  map.on('mouseleave', 'travel-time-fill', () => {
    map.getCanvas().style.cursor = ''
    tooltip.remove()
  })

  map.on('click', 'travel-time-fill', e => {
    const id = e.features?.[0]?.id
    if (mode.kind !== 'reachable' || typeof id !== 'number') return
    origin = origin.extract() === id ? Nothing : Just(id)
    render()
  })

  render()
}

map.on('load', () => {
  void Promise.all([fetchDesoAreas().run(), fetchTravelTimeMatrix().run(), fetchFixedDestinations().run()]).then(
    ([areas, matrix, destinations]) =>
      areas
        .chain(a => matrix.chain(m => destinations.map(d => [a, m, d] as const)))
        .caseOf({
          Left: err => {
            console.error(`[travel-time] ${err.message}`)
            travelTimeSubPanel.textContent = 'Travel times could not be loaded'
          },
          Right: ([a, m, d]) => setUpTravelTime(a, m, d),
        }),
  )

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

  void fetchStatisticalAreas()
    .run()
    .then(result =>
      result.caseOf({
        Left: err => console.error(`[statistical-areas] ${err.message}`),
        Right: geojson => {
          map.addSource('statistical-areas', {
            type: 'geojson',
            data: geojson as unknown as FeatureCollection,
            promoteId: 'samsCode',
          })

          map.addLayer({
            id: 'statistical-areas-fill',
            type: 'fill',
            source: 'statistical-areas',
            layout: { visibility: statisticalAreasToggle.defaultVisibility },
            paint: {
              'fill-color': [
                'case',
                ['==', ['get', 'displayCategory'], 'selected'],
                '#f59e0b',
                ['any', ['==', ['get', 'displayCategory'], 'top10'], ['==', ['get', 'displayCategory'], 'topMatch']],
                [
                  'interpolate',
                  ['linear'],
                  ['get', 'similarityScore'],
                  0.0,
                  '#bfdbfe',
                  0.5,
                  '#3b82f6',
                  1.0,
                  '#1d4ed8',
                ],
                '#94a3b8',
              ] as unknown as ExpressionSpecification,
              'fill-opacity': [
                'case',
                ['==', ['get', 'displayCategory'], 'selected'],
                0.9,
                ['==', ['get', 'displayCategory'], 'topMatch'],
                0.85,
                ['==', ['get', 'displayCategory'], 'top10'],
                0.7,
                0.2,
              ] as unknown as ExpressionSpecification,
            },
          })

          map.addLayer({
            id: 'statistical-areas-border',
            type: 'line',
            source: 'statistical-areas',
            layout: { visibility: statisticalAreasToggle.defaultVisibility },
            paint: {
              // The most similar area gets the same amber outline as the selected area, so the
              // single best match is identifiable at a glance against the rest of the blue gradient.
              'line-color': [
                'case',
                ['==', ['get', 'displayCategory'], 'topMatch'],
                '#f59e0b',
                '#ffffff',
              ] as unknown as ExpressionSpecification,
              'line-width': [
                'case',
                ['==', ['get', 'displayCategory'], 'topMatch'],
                2,
                0.5,
              ] as unknown as ExpressionSpecification,
            },
          })

          map.on('mousemove', 'statistical-areas-fill', e => {
            const name = e.features?.[0]?.properties?.samsName as string | undefined
            if (!name) return
            map.getCanvas().style.cursor = 'pointer'
            tooltip.setLngLat(e.lngLat).setText(name).addTo(map)
          })
          map.on('mouseleave', 'statistical-areas-fill', () => {
            map.getCanvas().style.cursor = ''
            tooltip.remove()
          })

          // The only state that changes after load is which area is selected; it is scoped to
          // this layer's click handler rather than held at module level.
          let selectedSamsCode: SamsCode | null = null

          map.on('click', 'statistical-areas-fill', e => {
            const props = e.features?.[0]?.properties as
              | (Record<string, unknown> & StatisticalAreaProperties)
              | undefined
            if (!props) return

            const clickedCode = props.samsCode
            const source = map.getSource('statistical-areas') as GeoJSONSource

            if (clickedCode === selectedSamsCode) {
              selectedSamsCode = null
              applySimilarityScores(source, geojson, new Map(), null, null)
              updateSimilarityPanel(similarityPanel, null, null)
              return
            }

            selectedSamsCode = clickedCode

            parseVector(props).caseOf({
              Left: err => console.error(`[statistical-areas] ${err.message}`),
              Right: vector => {
                const allProps = geojson.features.map(f => f.properties)
                const ranked = rankBySimilarity(clickedCode, vector, allProps)
                const minScore = ranked[ranked.length - 1]?.score ?? 0
                const maxScore = ranked[0]?.score ?? 1
                const range = maxScore - minScore
                const rescale = (s: number): number => (range === 0 ? 1 : (s - minScore) / range)
                // Only the map colouring is stretched across this click's spread, so the top
                // matches don't all render as the same shade; the panel shows the score itself.
                const scoreMap = new Map(ranked.map(r => [r.samsCode, rescale(r.score)] as const))
                scoreMap.set(clickedCode, 1.0)
                const topMatchCode = ranked[0]?.samsCode ?? null
                applySimilarityScores(source, geojson, scoreMap, clickedCode, topMatchCode)
                updateSimilarityPanel(similarityPanel, props.samsName, ranked.slice(0, 10))
              },
            })
          })
        },
      }),
    )
})
