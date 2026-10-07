# GAPS

An interactive map for exploring geographic and demographic gaps in Stockholm.

## Tech stack

- **TypeScript** — strict, no `any`
- **MapLibre GL** — open-source map renderer
- **purify-ts** — functional programming primitives (`Maybe`, `Either`, `EitherAsync`)
- **Vite** — dev server and bundler
- **Vitest** — unit tests

The codebase follows functional programming and Domain-Driven Design principles: pure functions, immutable data, errors as values (never thrown), and code organised by domain rather than technical layer.

## Features

| Status | Feature |
|--------|---------|
| Done | **Stockholm municipalities on the map** — all municipalities rendered as a fill layer, with a toggle control to show/hide the boundaries |
| Done | **Voting districts colored by party** — overlay voting districts (valdistrikt) and color each by the dominant party in the most recent election; legend with official party colors |
| Planned | **Demographic similarity** — click an area and highlight other areas across Stockholm with the most similar demographic profile (SCB data, statistical area level) |

## Ideas & upcoming features

### 1. Demographic similarity — click an area, find its twins

Click on a smaller area (city district / statistical area level — think Hagsätra/Rågsved or Kista) and the map highlights other areas across Stockholm that have the most similar demographic profile.

Sketch:
- Source data: SCB publishes demographic statistics at statistical area (SAMS-område) level (age, income, foreign background, housing type, etc.)
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
