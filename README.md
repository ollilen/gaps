# GAPS

An interactive map for exploring geographic and demographic gaps in Stockholm.

Currently shows Stockholm's municipalities (kommuner) rendered on a MapLibre GL map, with a toggle control to show/hide the municipal boundaries layer.

## Tech stack

- **TypeScript** — strict, no `any`
- **MapLibre GL** — open-source map renderer
- **purify-ts** — functional programming primitives (`Maybe`, `Either`, `EitherAsync`)
- **Vite** — dev server and bundler
- **Vitest** — unit tests

The codebase follows functional programming and Domain-Driven Design principles: pure functions, immutable data, errors as values (never thrown), and code organised by domain rather than technical layer.

## Ideas & upcoming features

### 1. Voting areas colored by party

Overlay Stockholm's voting districts (valdistrikt) on the map and color each district by the dominant party in the most recent election. This would make it easy to see political geography at a glance — where different parties have their strongholds across the city.

Sketch:
- Source data: Valmyndigheten publishes election results per valdistrikt as open data
- Each district gets a fill color mapped to the party with the most votes
- A legend shows the party–color mapping (using the parties' official colors)
- Toggle control to switch between the municipal layer and the voting district layer

### 2. Demographic similarity — click an area, find its twins

Click on a smaller area (stadsdel/SAMS-område level — think Hagsätra/Rågsved or Kista) and the map highlights other areas across Stockholm that have the most similar demographic profile.

Sketch:
- Source data: SCB publishes demographic statistics at SAMS-område level (age, income, foreign background, housing type, etc.)
- On click, compute a similarity score between the selected area and all others (e.g. cosine similarity or Euclidean distance over normalized features)
- Highlight the top N most similar areas with a gradient fill; de-emphasize the rest
- A side panel lists the matched areas with the key shared characteristics

---

## Development

```sh
npm install
npm run dev
```

## Testing

```sh
npm test          # run tests
npm run typecheck # type-check only
```

## Build

```sh
npm run build
```
