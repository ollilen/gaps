# GAPS

An interactive map for exploring geographic and demographic gaps in Stockholm.

## Tech stack

- **TypeScript** — strict, no `any`
- **MapLibre GL** — open-source map renderer
- **purify-ts** — functional programming primitives (`Maybe`, `Either`, `EitherAsync`)
- **Vite** — dev server and bundler
- **Vitest** — unit tests

The codebase follows functional programming and Domain-Driven Design principles: pure functions, immutable data, errors as values (never thrown), and code organised by domain rather than technical layer.

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
