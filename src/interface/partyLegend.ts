import type { PartyCode } from '../domain/election'
import { partyColors, partyLabels } from '../domain/election'

export const buildPartyLegend = (parties: readonly PartyCode[]): HTMLElement => {
  const container = document.createElement('div')

  parties.forEach(code => {
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

  return container
}
