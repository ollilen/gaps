import type { IControl, Map as MapLibreMap } from 'maplibre-gl'
import { Maybe, Nothing, Just } from 'purify-ts/Maybe'
import { toggleVisibility, type LayerToggle, type Visibility } from '../domain/layerToggle'

const applyVisibility = (map: MapLibreMap, toggle: LayerToggle, visibility: Visibility): void => {
  toggle.layerIds.forEach(layerId => map.setLayoutProperty(layerId, 'visibility', visibility))
}

export class MapControlsPanel implements IControl {
  private readonly toggles: readonly LayerToggle[]
  private container: Maybe<HTMLElement> = Nothing
  private map: Maybe<MapLibreMap> = Nothing
  private state: Record<string, Visibility>

  constructor(toggles: readonly LayerToggle[]) {
    this.toggles = toggles
    this.state = Object.fromEntries(toggles.map(toggle => [toggle.id, toggle.defaultVisibility]))
  }

  onAdd(map: MapLibreMap): HTMLElement {
    this.map = Just(map)

    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group map-controls-panel'

    this.toggles.forEach(toggle => {
      container.appendChild(this.buildToggleRow(toggle))
    })

    this.container = Just(container)
    return container
  }

  onRemove(): void {
    this.container.ifJust(c => c.remove())
    this.container = Nothing
    this.map = Nothing
  }

  private buildToggleRow(toggle: LayerToggle): HTMLElement {
    const row = document.createElement('label')
    row.className = 'map-controls-panel__row'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = toggle.defaultVisibility === 'visible'
    checkbox.addEventListener('change', () => this.handleToggle(toggle))

    const text = document.createElement('span')
    text.textContent = toggle.label

    row.appendChild(checkbox)
    row.appendChild(text)
    return row
  }

  private handleToggle(toggle: LayerToggle): void {
    this.map.ifJust(m => {
      const next = toggleVisibility(this.state[toggle.id] ?? toggle.defaultVisibility)
      this.state = { ...this.state, [toggle.id]: next }
      applyVisibility(m, toggle, next)
    })
  }
}
