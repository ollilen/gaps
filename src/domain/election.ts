export type PartyCode = 'S' | 'M' | 'SD' | 'C' | 'V' | 'KD' | 'L' | 'MP' | 'OTHER'

export type HexColor = `#${string}`

// S/V (both red) and M/L (both blue) were previously near-indistinguishable on the filled
// map (RGB distance ~30); V and L are shifted within their party's hue family to push that
// well above the other pairs' contrast (~80-95) while staying recognizable.
export const partyColors: Readonly<Record<PartyCode, HexColor>> = {
  S: '#E8112d',
  M: '#1B68AF',
  SD: '#DDDD00',
  C: '#009933',
  V: '#8B1538',
  KD: '#231977',
  L: '#00A6D6',
  MP: '#83CF39',
  OTHER: '#999999',
}

export const partyLabels: Readonly<Record<PartyCode, string>> = {
  S: 'Socialdemokraterna',
  M: 'Moderaterna',
  SD: 'Sverigedemokraterna',
  C: 'Centerpartiet',
  V: 'Vänsterpartiet',
  KD: 'Kristdemokraterna',
  L: 'Liberalerna',
  MP: 'Miljöpartiet',
  OTHER: 'Other',
}
