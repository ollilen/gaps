import { describe, it, expect } from 'vitest'
import { toggleVisibility } from './layerToggle'

describe('toggleVisibility', () => {
  it('switches visible to none', () => {
    expect(toggleVisibility('visible')).toBe('none')
  })

  it('switches none to visible', () => {
    expect(toggleVisibility('none')).toBe('visible')
  })
})
