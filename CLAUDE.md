# CLAUDE.md — Project Instructions

## Application
Full-stack web application built with TypeScript (Node.js).

## Core Principles

### Security First
- Validate and sanitize all external input at system boundaries (HTTP, env, DB)
- Never trust user input; treat it as untrusted until explicitly validated
- Use parameterized queries — no string interpolation in SQL
- Store secrets in environment variables; never commit them
- Apply the principle of least privilege (DB roles, API permissions, file access)
- Set secure HTTP headers (CORS, CSP, HSTS, etc.)
- Hash passwords with bcrypt/argon2; never store plaintext
- Rate-limit all public endpoints

### Functional Programming
- Prefer pure functions with no side effects
- Avoid mutation; use `const`, `readonly`, and immutable data structures
- Use `map`, `filter`, `reduce` over imperative loops
- Model errors as values (Result/Either types) rather than throwing exceptions
- Compose small, single-purpose functions into larger behaviors
- Avoid classes where functions and modules suffice

### Domain-Driven Design (DDD)
- Organize code around business domains, not technical layers
- Define a ubiquitous language and use it consistently in code, types, and tests
- Use value objects for concepts with no identity (e.g. `Email`, `Money`)
- Use entities for concepts with identity (e.g. `User`, `Order`)
- Expose domain logic through domain services and aggregate roots
- Keep infrastructure (DB, HTTP, external APIs) outside the domain layer
- Use repository interfaces in the domain; implement them in infrastructure

**Directory structure:**
```
src/
  domain/         # Entities, value objects, domain services, repository interfaces
  application/    # Use cases / application services
  infrastructure/ # DB, HTTP clients, external APIs, framework config
  interface/      # HTTP controllers, CLI handlers, GraphQL resolvers
```

### Test-Driven Development (TDD)
- Write the failing test first, then the minimal implementation to pass it
- Red → Green → Refactor — no skipping steps
- Unit-test domain logic in isolation (no DB, no HTTP)
- Integration-test infrastructure adapters against real dependencies (use Docker/testcontainers)
- E2E-test critical user journeys
- Aim for high coverage in the domain and application layers; lower in infrastructure glue
- Tests are part of the codebase — keep them clean, readable, and maintainable

## Code Style
- No `any` — use explicit types or `unknown` with type guards
- Prefer `type` aliases over `interface` unless declaration merging is needed
- Keep functions small and focused (one responsibility)
- No comments explaining what the code does — only why, when non-obvious
- No default exports
- Use named exports consistently

## Git Workflow
- Never push directly to `main` — always create a feature branch and open a PR
- Branch naming: `feat/short-description`, `fix/short-description`, `chore/short-description`
- CI runs typecheck, tests, and build on every PR — all must pass before merge
- main is protected; merges only via approved PRs

## Tooling Conventions
- Use a linter (ESLint) and formatter (Prettier) — enforce via CI
- Type-check with `tsc --noEmit` in CI
- Run tests with `npm test` (or `npx vitest`)
- Fail fast: CI must pass before merge

## Dependency Versioning
- Always use the latest stable release of every dependency
- Check `npm show <pkg> dist-tags` — use the version tagged `latest`; never use `next`, `beta`, `rc`, `alpha`, `insiders`, or `dev` tags
- When adding or upgrading a package, verify all peer dependencies remain compatible before committing
- After any version change: run `npm install`, `tsc --noEmit`, and `npm test` to confirm nothing broke

## Language
- All code must be in English: variable names, function names, file names, type names, layer IDs, source keys, property names
- This applies even when domain concepts are discussed in Swedish — translate to English in code (e.g. "kommuner" → "municipalities")

## Commit Messages
- Use Conventional Commits: `type(scope): summary`
- Summary: imperative, lowercase, no trailing period, <=72 chars
- Types: feat, fix, chore, refactor, test, docs, ci, style, perf
- Scope optional, e.g. `feat(map): color municipalities by kommun code`
- Body (optional): explain why, not what; wrap at 72 chars
- Breaking change: `!` after type/scope, plus a `BREAKING CHANGE:` footer
- One logical change per commit

## What to Avoid
- Mutable global state
- God objects / god functions
- `any` casts
- Skipping tests to ship faster
- Hardcoded secrets or environment-specific values in source code
- Catching errors silently (`catch (_) {}`)
