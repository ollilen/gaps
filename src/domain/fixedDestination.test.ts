import { describe, it, expect } from 'vitest'
import { Right } from 'purify-ts/Either'
import { Just, Nothing } from 'purify-ts/Maybe'
import { parseFixedDestinations } from './fixedDestination'

describe('parseFixedDestinations', () => {
  const valid = {
    id: 'sodersjukhuset',
    label: 'Södersjukhuset',
    lng: 18.05,
    lat: 59.31,
    minutes: [12, null, 40],
  }

  it('parses destinations, turning null minutes into Nothing', () => {
    expect(parseFixedDestinations([valid])).toEqual(
      Right([
        {
          id: 'sodersjukhuset',
          label: 'Södersjukhuset',
          coordinate: { lng: 18.05, lat: 59.31 },
          minutes: [Just(12), Nothing, Just(40)],
        },
      ]),
    )
  })

  it('rejects input that is not an array', () => {
    expect(parseFixedDestinations({}).isLeft()).toBe(true)
  })

  it.each([
    ['a missing label', { ...valid, label: undefined }],
    ['an invalid coordinate', { ...valid, lat: 123 }],
    ['a non-numeric minute', { ...valid, minutes: ['12'] }],
    ['a negative minute', { ...valid, minutes: [-1] }],
  ])('rejects a destination with %s', (_, destination) => {
    expect(parseFixedDestinations([destination]).isLeft()).toBe(true)
  })
})
