export type KommunKod = string
export type HexColor = `#${string}`
export type MunicipalityColorMap = Readonly<Record<KommunKod, HexColor>>

export const stockholmMunicipalityColors: MunicipalityColorMap = {
  '0114': '#4e79a7', // Upplands Väsby
  '0115': '#f28e2b', // Vallentuna
  '0117': '#e15759', // Österåker
  '0120': '#76b7b2', // Värmdö
  '0123': '#59a14f', // Järfälla
  '0125': '#edc948', // Ekerö
  '0126': '#b07aa1', // Huddinge
  '0127': '#ff9da7', // Botkyrka
  '0128': '#9c755f', // Salem
  '0136': '#bab0ac', // Haninge
  '0138': '#499894', // Tyresö
  '0139': '#f1ce63', // Upplands-Bro
  '0140': '#d37295', // Nykvarn
  '0160': '#a0cbe8', // Täby
  '0162': '#ffbe7d', // Danderyd
  '0163': '#8cd17d', // Sollentuna
  '0180': '#86bcb6', // Stockholm
  '0181': '#e49444', // Södertälje
  '0182': '#d4a6c8', // Nacka
  '0183': '#9d7660', // Sundbyberg
  '0184': '#bcbd22', // Solna
  '0186': '#17becf', // Lidingö
  '0187': '#aec7e8', // Vaxholm
  '0188': '#ffbb78', // Norrtälje
  '0191': '#98df8a', // Sigtuna
  '0192': '#c5b0d5', // Nynäshamn
}
