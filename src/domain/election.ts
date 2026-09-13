export type PartyCode = 'S' | 'M' | 'SD' | 'C' | 'V' | 'KD' | 'L' | 'MP' | 'OTHER'

export type HexColor = `#${string}`

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
