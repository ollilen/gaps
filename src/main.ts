import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const container = document.getElementById('map')
if (!container) throw new Error('Map container #map not found')

new maplibregl.Map({
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
