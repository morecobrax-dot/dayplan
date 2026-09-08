# Starter architecture

How the pieces fit, and where your product goes.

---

## The shape of `index.html`

The whole application is one file with four blocks, in this order:

| Block | Contains |
|---|---|
| `<head>` | Meta, viewport, manifest link. The block between `APP-META-BEGIN/END` is **derived** — written by `config:sync`. |
| One `<style>` | Design tokens, then base, shell, controls, surfaces, overlay presentation, toast, responsive. |
| `<body>` markup | The shell, the tab views, and every overlay declared statically. All other DOM is generated. |
| One `<script>` | Config, release notes, storage, migration, overlay engine, toast, confirmation, icons, navigation, demo domain, boot. |

**Keep it to one substantial `<script>` block.** The test harness evaluates
only the largest one. Code in a second block, or in a linked `.js` file, is
invisible to every contract and the suite will still pass. A contract asserts
this, so you will be told if it slips.

This is not a stylistic preference — it is what makes a zero-build application
fully testable in Node without a browser, a bundler or a dependency.

## Application identity

`APP_CONFIG` near the top of the script is the single source. Everything else
derives from it:

```
APP_CONFIG.id ──┬── STORAGE_NAMESPACE   `<id>.`
                ├── CACHE_NAMESPACE     `<id>-v<version>`
                └── package.json name

APP_UPDATES[0].version ── APP_VERSION ──┬── CACHE_NAMESPACE
                                        └── package.json version

APP_CONFIG.name/shortName/description/themeColor
                └── <head> meta, manifest.webmanifest
```

Static files cannot read a JavaScript object at runtime, so
`npm run config:sync` writes the derived values into them, and
`npm run config:verify` (part of `npm run verify`) fails if they drift. There
is no build step: the app runs from source either way.

Adding a new derived value means one entry in `targets()` in
`scripts/config.js`.

`APP_ID` is validated, not sanitised. An invalid id fails loudly, because an id
quietly rewritten into something you did not choose is how two products end up
sharing a namespace.

## Design tokens

Four layers in one `:root`, meant to be edited in order:

1. **Brand** — fonts, accent, and the ground-and-surface ramp. This is the
   whole dial: retheming is editing this block and nothing else. The surface
   steps are literal values rather than computed from the ground, because the
   distances between them were chosen for contrast, not arithmetic.
2. **Semantic** — `--bg`, `--surface`, `--text`, `--success`… Roles, aliased
   onto layer 1. Components reference only these, so no component ever needs
   editing to change the look.
3. **Scale** — type, space, radius, shadow, motion, layout, touch, safe-area
   insets, breakpoints. Rarely changed.
4. **Domain** — deliberately empty. Your product's own category colours go here.

Two contracts keep the system real rather than aspirational: no `font-family`
literal outside layer 1, and no `font-size` outside the type scale. Genuine
exceptions are marked inline with `/* fs-exempt: reason */` in the eight lines
above the declaration, so the reason travels with the line.

Fonts are system stacks — no network request, nothing to cache offline, no
silent fallback. To use a webfont, add one `<link>` and change `--font-ui`.

## The overlay engine

The most valuable system here. One `MutationObserver` on the body subtree
drives everything that must happen when any surface opens or closes:

- **Scroll lock** — `position: fixed` on the body (what iOS needs), offset
  captured and restored instantly, depth-counted so nested layers do not
  unlock early.
- **Focus** — the surface takes focus, not its first field, so a keyboard does
  not cover the screen. Tab is trapped. Focus returns to the opening control if
  that control still exists.
- **Stacking** — z-index is painted from open order, not document order, so a
  surface opened from another is always on top.
- **ARIA** — `role="dialog"` and `aria-modal` applied and removed with the stack.
- **Escape** — closes the top surface through *that surface's own* declared
  close path, found from its `backdropDismiss(event, fn)` handler or its
  `close*()` button. Nothing is invented; a surface with no declared exit is
  left alone.

Two presentations share it: `.overlay` is a bottom sheet, `.overlay.overlay-page`
is a full page. There is no second implementation of any of the above, and a
contract asserts there is only one observer.

**To add a surface:** declare a `.overlay` div with an id and a `.sheet` inside
it, give it a `close*()` function, and toggle `.open`. Everything above happens
for free. Do not add a lock/unlock pair.

## Storage

One adapter. Every key is prefixed with `APP_ID` inside the module, so no call
site can write an unnamespaced key.

```
<APP_ID>.sys.schemaVersion      migration state
<APP_ID>.sys.backup.<v>.<key>   pre-migration snapshots
<APP_ID>.ui.<name>              per-viewer preferences
<APP_ID>.draft.<form>           in-progress input, never committed data
<APP_ID>.data.<collection>      committed records
```

This prefix is the only thing separating two products deployed under the same
`username.github.io` — `localStorage` and Cache Storage are keyed by origin,
not by path. A contract runs two app ids against one shared store and proves
they cannot see each other.

`set()` returns a real boolean. `getJSON()` returns your fallback on corrupt
data rather than throwing. A missing key reads `null` and is never repaired
with a default.

**Migrations** are keyed by the version they upgrade *from* and run in
sequence. Every key is backed up first; a failure restores it and surfaces a
warning. Bump `DATA_SCHEMA_VERSION` only when the *shape* of stored data
changes.

## Feedback

- `toast(message, variant)` — non-blocking, one `aria-live` region, capped at
  three, auto-dismissing, reduced-motion aware. Use it after something
  succeeded.
- `confirmAction({ title, message, confirmLabel, destructive })` — returns
  `Promise<boolean>`, runs on the overlay engine. Use it *before* something
  consequential and destructive.

There is no `alert()`, `confirm()` or `prompt()`, and a contract keeps it that
way.

## PWA

Every path is relative, so the app works from any deployment sub-path without
modification. The service worker is network-first with a cache fallback, so a
fresh deploy is picked up as soon as there is a connection.

Cache cleanup on activate is filtered to this app's own prefix — deleting by
anything looser is how one deployment wipes another's cache on a shared origin.

The worker caches application code only. Everything a person creates lives in
`localStorage` and is never touched, so clearing caches cannot lose a record.

## Testing

`test/harness.js` reads `index.html` as text, extracts the largest `<script>`
block, and evaluates it in a Node `vm` against a DOM stub and an in-memory
`localStorage`. No browser, no jsdom, no dependency.

Top-level `const`/`let` create lexical bindings that do not attach to
`globalThis`, so a bootstrap bridges each name in `BRIDGE` to a live accessor.
**If you add a top-level binding a test needs to reach, add its name to
`BRIDGE`.**

`loadApp({ appId, sharedStorage, failWrites })` is how the collision and
storage-failure contracts run: two identities against one store, or a store
that refuses writes.

Contracts are grouped by what they protect, in dependency order — identity and
storage first, because everything above them is meaningless if those are wrong.
Aim for high-value contracts, not volume.

## The foundation → domain seam

The foundation reaches a product through exactly four points, declared together
just above the demo section:

```js
const Domain = {
  hydrate(){},   // read your state out of Store
  render(){},    // paint your screens
  wire(){},      // attach your own listeners, once, at boot
  tabIcons: {}   // { <data-tab value>: '<svg path markup>' }
};
```

They are no-ops by default, so **deleting the demo leaves an app that still
boots**, into a working but empty shell. `boot()` and `renderAll()` call only
these, and a contract asserts that no foundation code names anything the demo
defines.

Two more things follow the same rule rather than being special-cased:

- **Which tabs exist** is declared once, in the markup. `paintStaticIcons()`
  reads `data-tab` off each `.tab-btn` and looks the glyph up in
  `Domain.tabIcons`, so adding a tab is a markup edit plus one icon entry.
- **Backup import** merges whatever collections the backup file itself
  declares, recognising a record by it having an `id`. A product that replaces
  the demo does not have to rewrite import — and, more importantly, import
  cannot silently restore nothing while reporting success.

## Where your product goes

| You are adding | Put it |
|---|---|
| A screen | A `.view` in the body, a tab button, a render function |
| A destination opened from a row | A `.overlay.overlay-page` + `open*/close*` pair |
| A decision or short form | A `.overlay` sheet |
| Persistent state | A key in `KEYS`, under `data.` or `ui.` |
| A data shape change | Bump `DATA_SCHEMA_VERSION`, add a migration |
| A category colour | Token layer 4 |
| A new primitive | Only if the demo or your product actually uses it |
| A release | An `APP_UPDATES` entry, then `npm run config:sync` |

Replace the `DEMO DOMAIN` section wholesale. Nothing above it depends on
anything below it.
