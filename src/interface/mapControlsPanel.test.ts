import { describe, it, expect, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { applyVisibility } from './mapControlsPanel'
import type { LayerToggle } from '../domain/layerToggle'

const toggle: LayerToggle = {
  id: 'municipalities',
  label: 'Municipalities',
  layerIds: ['municipalities-fill', 'municipalities-border'],
  defaultVisibility: 'visible',
}

const buildMap = (existingLayerIds: readonly string[]) =>
  ({
    getLayer: vi.fn((id: string) => (existingLayerIds.includes(id) ? {} : undefined)),
    setLayoutProperty: vi.fn(),
  }) as unknown as MapLibreMap

describe('applyVisibility', () => {
  it('sets the layout property on layers that exist', () => {
    const map = buildMap(['municipalities-fill', 'municipalities-border'])
    applyVisibility(map, toggle, 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('municipalities-fill', 'visibility', 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('municipalities-border', 'visibility', 'none')
  })

  it('skips layers that have not been added to the map yet, without throwing', () => {
    const map = buildMap([])
    expect(() => applyVisibility(map, toggle, 'visible')).not.toThrow()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })

  it('only sets layout property for layers that exist when some are missing', () => {
    const map = buildMap(['municipalities-fill'])
    applyVisibility(map, toggle, 'visible')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('municipalities-fill', 'visibility', 'visible')
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith('municipalities-border', 'visibility', 'visible')
  })
})
