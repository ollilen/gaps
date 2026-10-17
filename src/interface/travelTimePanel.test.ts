// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { buildTravelTimePanel, updateTravelTimeStatus, type TravelTimeModeOption } from './travelTimePanel'

const options: readonly TravelTimeModeOption[] = [
  { id: 'reachable', label: 'Reachable within 1 h' },
  { id: 'sodersjukhuset', label: 'Time to Södersjukhuset' },
]

describe('buildTravelTimePanel', () => {
  it('offers one mode per option, with the first one selected', () => {
    const panel = buildTravelTimePanel(options, vi.fn())
    const radios = [...panel.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(radios.map(r => r.value)).toEqual(['reachable', 'sodersjukhuset'])
    expect(radios.map(r => r.checked)).toEqual([true, false])
    expect([...panel.querySelectorAll('.travel-time-panel__mode')].map(m => m.textContent)).toEqual([
      'Reachable within 1 h',
      'Time to Södersjukhuset',
    ])
  })

  it('reports the chosen mode when the selection changes', () => {
    const onSelect = vi.fn()
    const panel = buildTravelTimePanel(options, onSelect)
    document.body.appendChild(panel)
    const second = panel.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
    second?.click()
    expect(onSelect).toHaveBeenCalledWith('sodersjukhuset')
    panel.remove()
  })

  it('keeps its radio group separate from the layer radios in the controls panel', () => {
    const panel = buildTravelTimePanel(options, vi.fn())
    const names = new Set([...panel.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map(r => r.name))
    expect(names).toEqual(new Set(['travel-time-mode']))
  })

  it('shows a legend with one row per time band', () => {
    const panel = buildTravelTimePanel(options, vi.fn())
    const labels = [...panel.querySelectorAll('.travel-time-panel__legend-label')].map(l => l.textContent)
    expect(labels).toEqual(['≤ 15 min', '≤ 30 min', '≤ 45 min', '≤ 60 min', '> 60 min'])
  })
})

describe('updateTravelTimeStatus', () => {
  it('replaces the status text', () => {
    const panel = buildTravelTimePanel(options, vi.fn())
    updateTravelTimeStatus(panel, 'Kista: 412 areas within 1 h')
    updateTravelTimeStatus(panel, 'Farsta: 380 areas within 1 h')
    expect(panel.querySelector('.travel-time-panel__status')?.textContent).toBe('Farsta: 380 areas within 1 h')
  })
})
