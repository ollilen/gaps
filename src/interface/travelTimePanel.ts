import type { TravelTimeBand } from '../domain/travelTime'
import type { AreaCategory } from '../domain/travelTimeView'

export type TravelTimeModeOption = { readonly id: string; readonly label: string }

// Sequential (YlGnBu): the darker the area, the quicker it is to get to. The origin reuses the
// amber that marks the selected area in the similarity view.
export const travelTimeCategoryColors: Readonly<Record<AreaCategory, string>> = {
  origin: '#f59e0b',
  upTo15: '#253494',
  upTo30: '#2c7fb8',
  upTo45: '#41b6c4',
  upTo60: '#a1dab4',
  over60: '#edf8b1',
  outside: '#94a3b8',
}

const legendBands: readonly (readonly [TravelTimeBand, string])[] = [
  ['upTo15', '≤ 15 min'],
  ['upTo30', '≤ 30 min'],
  ['upTo45', '≤ 45 min'],
  ['upTo60', '≤ 60 min'],
  ['over60', '> 60 min'],
]

const buildModeRow = (option: TravelTimeModeOption, checked: boolean, onSelect: (id: string) => void): HTMLElement => {
  const row = document.createElement('label')
  row.className = 'travel-time-panel__mode-row'

  const input = document.createElement('input')
  input.type = 'radio'
  input.name = 'travel-time-mode'
  input.value = option.id
  input.checked = checked
  input.addEventListener('change', () => onSelect(option.id))

  const text = document.createElement('span')
  text.className = 'travel-time-panel__mode'
  text.textContent = option.label

  row.appendChild(input)
  row.appendChild(text)
  return row
}

const buildLegend = (): HTMLElement => {
  const legend = document.createElement('div')
  legend.className = 'travel-time-panel__legend'
  legendBands.forEach(([band, label]) => {
    const row = document.createElement('div')
    row.className = 'travel-time-panel__legend-row'

    const swatch = document.createElement('span')
    swatch.className = 'travel-time-panel__legend-swatch'
    swatch.style.backgroundColor = travelTimeCategoryColors[band]

    const text = document.createElement('span')
    text.className = 'travel-time-panel__legend-label'
    text.textContent = label

    row.appendChild(swatch)
    row.appendChild(text)
    legend.appendChild(row)
  })
  return legend
}

export const buildTravelTimePanel = (
  options: readonly TravelTimeModeOption[],
  onSelect: (id: string) => void,
): HTMLElement => {
  const panel = document.createElement('div')
  panel.className = 'travel-time-panel'

  options.forEach((option, i) => panel.appendChild(buildModeRow(option, i === 0, onSelect)))

  const status = document.createElement('p')
  status.className = 'travel-time-panel__status'
  panel.appendChild(status)

  panel.appendChild(buildLegend())
  return panel
}

export const updateTravelTimeStatus = (panel: HTMLElement, text: string): void => {
  const status = panel.querySelector('.travel-time-panel__status')
  if (status) status.textContent = text
}
