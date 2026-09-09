import type { IControl } from 'maplibre-gl'
import type { PartyCode } from '../domain/election'
import { partyColors, partyLabels } from '../domain/election'

export class PartyLegend implements IControl {
  private readonly parties: readonly PartyCode[]
  private container: HTMLElement | undefined

  constructor(parties: readonly PartyCode[]) {
    this.parties = parties
  }

  onAdd(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group party-legend'

    this.parties.forEach(code => {
      const row = document.createElement('div')
      row.className = 'party-legend__row'

      const swatch = document.createElement('span')
      swatch.className = 'party-legend__swatch'
      swatch.style.backgroundColor = partyColors[code]

      const label = document.createElement('span')
      label.className = 'party-legend__label'
      label.textContent = code === 'OTHER' ? partyLabels[code] : `${code} — ${partyLabels[code]}`

      row.appendChild(swatch)
      row.appendChild(label)
      container.appendChild(row)
    })

    this.container = container
    return container
  }

  onRemove(): void {
    this.container?.remove()
    this.container = undefined
  }
}
