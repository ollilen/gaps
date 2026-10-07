import type { SamsCode } from '../domain/statisticalArea'

export type SimilarityPanelEntry = {
  readonly samsCode: SamsCode
  readonly samsName: string
  readonly score: number // rescaled 0-1 relative to this click's spread, shown as a percentage
  readonly rawScore: number // Euclidean similarity 0-1, shown alongside the percentage
}

export const buildSimilarityPanel = (): HTMLElement => {
  const container = document.createElement('div')
  container.className = 'similarity-panel'
  container.dataset['state'] = 'idle'

  const idle = document.createElement('p')
  idle.className = 'similarity-panel__idle'
  idle.textContent = 'Click an area to find similar neighbourhoods'
  container.appendChild(idle)

  return container
}

export const updateSimilarityPanel = (
  panel: HTMLElement,
  selectedName: string | null,
  topMatches: readonly SimilarityPanelEntry[] | null,
): void => {
  panel.innerHTML = ''

  if (selectedName === null || topMatches === null) {
    panel.dataset['state'] = 'idle'
    const idle = document.createElement('p')
    idle.className = 'similarity-panel__idle'
    idle.textContent = 'Click an area to find similar neighbourhoods'
    panel.appendChild(idle)
    return
  }

  panel.dataset['state'] = 'active'

  const heading = document.createElement('p')
  heading.className = 'similarity-panel__heading'
  heading.textContent = selectedName
  panel.appendChild(heading)

  const list = document.createElement('ol')
  list.className = 'similarity-panel__list'

  topMatches.forEach((score, index) => {
    const item = document.createElement('li')
    item.className = 'similarity-panel__item'

    const rank = document.createElement('span')
    rank.className = 'similarity-panel__rank'
    rank.textContent = `${index + 1}.`

    const name = document.createElement('span')
    name.className = 'similarity-panel__name'
    name.textContent = score.samsName

    const pct = document.createElement('span')
    pct.className = 'similarity-panel__score'
    pct.textContent = `${Math.round(score.score * 100)}%`

    const raw = document.createElement('span')
    raw.className = 'similarity-panel__raw-score'
    raw.textContent = score.rawScore.toFixed(2)

    item.appendChild(rank)
    item.appendChild(name)
    item.appendChild(pct)
    item.appendChild(raw)
    list.appendChild(item)
  })

  panel.appendChild(list)
}
