// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildSimilarityPanel, updateSimilarityPanel, type SimilarityPanelEntry } from './similarityPanel'

const entry = (samsCode: string, samsName: string, score: number, rawScore: number): SimilarityPanelEntry => ({
  samsCode,
  samsName,
  score,
  rawScore,
})

describe('buildSimilarityPanel', () => {
  it('starts in the idle state with a prompt', () => {
    const panel = buildSimilarityPanel()
    expect(panel.dataset['state']).toBe('idle')
    expect(panel.querySelector('.similarity-panel__idle')?.textContent).toBe('Click an area to find similar neighbourhoods')
  })
})

describe('updateSimilarityPanel', () => {
  it('renders the idle state when selectedName is null', () => {
    const panel = buildSimilarityPanel()
    updateSimilarityPanel(panel, null, [entry('A', 'Area A', 0.9, 0.7)])
    expect(panel.dataset['state']).toBe('idle')
    expect(panel.querySelector('.similarity-panel__list')).toBeNull()
  })

  it('renders the idle state when topMatches is null', () => {
    const panel = buildSimilarityPanel()
    updateSimilarityPanel(panel, 'Area A', null)
    expect(panel.dataset['state']).toBe('idle')
  })

  it('renders the selected area name as the heading', () => {
    const panel = buildSimilarityPanel()
    updateSimilarityPanel(panel, 'Mälarhöjden', [entry('A', 'Area A', 0.9, 0.7)])
    expect(panel.dataset['state']).toBe('active')
    expect(panel.querySelector('.similarity-panel__heading')?.textContent).toBe('Mälarhöjden')
  })

  it('renders one list item per match, in order, with a 1-based rank', () => {
    const panel = buildSimilarityPanel()
    updateSimilarityPanel(panel, 'Selected', [
      entry('A', 'Area A', 1.0, 0.8),
      entry('B', 'Area B', 0.5, 0.6),
    ])
    const items = panel.querySelectorAll('.similarity-panel__item')
    expect(items).toHaveLength(2)
    expect(items[0]?.querySelector('.similarity-panel__rank')?.textContent).toBe('1.')
    expect(items[0]?.querySelector('.similarity-panel__name')?.textContent).toBe('Area A')
    expect(items[1]?.querySelector('.similarity-panel__rank')?.textContent).toBe('2.')
    expect(items[1]?.querySelector('.similarity-panel__name')?.textContent).toBe('Area B')
  })

  it('formats the rescaled score as a rounded percentage', () => {
    const panel = buildSimilarityPanel()
    updateSimilarityPanel(panel, 'Selected', [entry('A', 'Area A', 0.8749, 0.5)])
    const item = panel.querySelector('.similarity-panel__item')
    expect(item?.querySelector('.similarity-panel__score')?.textContent).toBe('87%')
  })

  it('formats the raw similarity score to 2 decimal places', () => {
    const panel = buildSimilarityPanel()
    updateSimilarityPanel(panel, 'Selected', [entry('A', 'Area A', 0.9, 0.62345)])
    const item = panel.querySelector('.similarity-panel__item')
    expect(item?.querySelector('.similarity-panel__raw-score')?.textContent).toBe('0.62')
  })

  it('replaces previous content rather than appending on repeated calls', () => {
    const panel = buildSimilarityPanel()
    updateSimilarityPanel(panel, 'First', [entry('A', 'Area A', 0.9, 0.7)])
    updateSimilarityPanel(panel, 'Second', [entry('B', 'Area B', 0.8, 0.6)])
    expect(panel.querySelectorAll('.similarity-panel__item')).toHaveLength(1)
    expect(panel.querySelector('.similarity-panel__heading')?.textContent).toBe('Second')
  })

  it('returns to idle and clears the list when deselecting after an active state', () => {
    const panel = buildSimilarityPanel()
    updateSimilarityPanel(panel, 'Selected', [entry('A', 'Area A', 0.9, 0.7)])
    updateSimilarityPanel(panel, null, null)
    expect(panel.dataset['state']).toBe('idle')
    expect(panel.querySelector('.similarity-panel__list')).toBeNull()
    expect(panel.querySelector('.similarity-panel__idle')).not.toBeNull()
  })
})
