# app-starter

An opinionated foundation for local-first, installable mobile web applications.

It exists so that building a new product means answering *"what should this
product do?"* rather than solving mobile navigation, overlays, safe areas,
forms, storage namespacing and PWA installation again from scratch.

---

## What it is

One HTML file, one service worker, one manifest, two icons. No framework, no
build step, no dependencies. `npm` is used only for the test and config
tooling — the app itself runs by opening `index.html`.

```
index.html              the entire application: tokens, shell, engine, demo
sw.js                   offline shell, cache identity derived from APP_CONFIG
manifest.webmanifest    install metadata, derived from APP_CONFIG
icon-192/512.png        placeholder icons — replace them
scripts/config.js       sync / verify static files against APP_CONFIG
scripts/contamination.js permanent domain-residue guard
test/harness.js         loads the app into a Node vm with a DOM stub
test/contracts.js       the contract suite
test/run.js             the runner
```

## What it includes

- **App shell** — header, bottom navigation, full-page detail flows, safe-area
  handling on all four edges, landscape and text-scaling behaviour that has
  been through real devices.
- **One overlay engine** — a single `MutationObserver` owning background scroll
  lock, focus trapping and restoration, open-order stacking and ARIA state, for
  every sheet and page. Adding a surface cannot forget any of it.
- **Namespaced storage** — one adapter, every key prefixed with `APP_ID`,
  honest reporting when a write cannot land, versioned migrations, and the rule
  that absent data stays absent.
- **Toast and confirmation** — non-blocking feedback and one confirmation
  sheet. No `alert()`, `confirm()` or `prompt()` anywhere, enforced by a test.
- **A design system that is enforced** — four token layers, with contracts that
  fail the build on a raw `font-family` or an off-scale `font-size`.
- **PWA** — installable, offline-capable, fully relative paths, and a cache
  identity that cannot collide with another app on the same origin.
- **A demo domain** — a small `Item` collection proving list, detail, create,
  edit, delete, validate, persist, confirm and empty state.
- **Contracts** — a few hundred assertions defending the foundation, not
  thousands defending a domain.

## What it deliberately does not include

No authentication, no backend, no database, no account system, no API layer, no
router, no state-management library, no component framework, no CSS framework,
no icon package, no charting, no date library, no analytics.

Those belong to a product, not to a foundation. Add them when a product
actually needs them.

## Run it

```bash
npx --yes http-server -p 8181 -c-1 .
```

Then open `http://localhost:8181`. A service worker needs `http(s)`, so opening
the file directly works but will not exercise offline behaviour.

## Verify it

```bash
npm run verify
```

That is the one command to remember. It runs the contract suite, checks that
the static PWA files still match `APP_CONFIG`, and scans for domain residue.
Run it before every commit and every deploy.

```bash
npm test              # contracts only
npm run config:verify # identity drift only
npm run contamination # residue scan only
npm run config:sync   # write derived values into the static files
```

## Start a new product

Read [NEW-PROJECT.md](NEW-PROJECT.md). The short version: set `APP_ID`, run
`npm run config:sync`, replace the demo domain.

## The rest of the documentation

- [PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) — the UX and visual rules this
  foundation encodes, and the anti-patterns it refuses.
- [STARTER-ARCHITECTURE.md](STARTER-ARCHITECTURE.md) — how the pieces fit and
  where new domain code goes.
- [NEW-PROJECT.md](NEW-PROJECT.md) — turning this into a real product.
- [CLAUDE.md](CLAUDE.md) — development method for AI coding sessions.
