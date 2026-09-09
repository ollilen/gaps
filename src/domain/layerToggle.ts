export type Visibility = 'visible' | 'none'

export type LayerToggle = {
  readonly id: string
  readonly label: string
  readonly layerIds: readonly string[]
  readonly defaultVisibility: Visibility
}

export const toggleVisibility = (current: Visibility): Visibility =>
  current === 'visible' ? 'none' : 'visible'
