# Starting a new product

From this starter to a real application. Follow it once, in order.

> **The one rule that matters most:** `APP_ID` must be unique for every product
> you deploy. `localStorage` and Cache Storage are keyed by **origin**, not by
> path, so two apps under the same `username.github.io` share both. A duplicated
> `APP_ID` means two products reading and writing each other's data, and each
> one's service worker deleting the other's cache.

## The whole flow

```
COPY THE STARTER          steps 1
     ↓
SET IDENTITY & THEME      steps 2–4
     ↓
SYNC CONFIG               step 5      npm run config:sync
     ↓
DECIDE WHAT IT DOES       step 6
     ↓
REPLACE THE DEMO DOMAIN   step 7      the four Domain seams
     ↓
DEFINE PRODUCT DATA       step 8      KEYS, migrations
     ↓
ADD DOMAIN CONTRACTS      step 9
     ↓
RESET RELEASE NOTES       step 10
     ↓
ADAPT THE DOCUMENTATION   step 11
     ↓
VERIFY                    step 12     npm run verify
     ↓
REAL-DEVICE QA            step 13     mandatory before production
     ↓
DEPLOY                    step 14
```

**Your product owns its code from step 1.** There is no dependency on this
starter — no submodule, no package, no shared runtime, and nothing that pulls
starter changes in later. That is deliberate: you copy the knowledge, then you
own the product. If you later improve something genuinely reusable, upstream it
to the starter by hand.

---

## 1. Create the repository

Copy this repository — do not fork it. A fork carries the starter's identity,
its issues and its history into your product.

```bash
# from a copy of these files, in a new empty directory
git init
git add -A
git commit -m "chore: start from app-starter"
git remote add origin https://github.com/<you>/<your-product>.git
git push -u origin main
```

## 2. Set the identity

Open `index.html` and edit `APP_CONFIG` — it is near the top of the script
block and it is the only place any of this is declared:

```js
const APP_CONFIG = {
  id: 'personal-savings',
  name: 'Personal Savings',
  shortName: 'Savings',
  description: 'Track what you are putting aside.',
  themeColor: '#0B0F16',
  backgroundColor: '#0B0F16'
};
```

`id` must be lowercase letters, digits and single hyphens, starting with a
letter. Invalid ids fail loudly rather than being quietly rewritten.

## 3. Set the theme

In the same file, token layer 1 (`1 · BRAND`):

```css
--font-ui: ...                    /* system stack by default */
--brand-accent: #4CC2FF;          /* your accent */
--brand-accent-deep: #2E6BFF;     /* its deeper partner, for the one gradient */
--brand-ground: #0B0F16;          /* the app's ground */
--brand-surface: #121824;         /* cards, sheets, the tab bar */
--brand-surface-raised: #1A2230;  /* inputs, toasts, things on a surface */
--brand-surface-sunken: #0A0E14;
--brand-border: #2A3547;
```

Everything else derives from these. If you find yourself editing a colour
anywhere but layer 1 or 2, stop and add a token instead.

To use a webfont, add one `<link>` to the head and change `--font-ui` /
`--font-display`. Give it a real fallback stack — the service worker will not
cache a third-party font, and offline first paint falls back silently.

## 4. Replace the icons

`icon-192.png` and `icon-512.png` ship as neutral placeholders. Replace both
with your own square, maskable artwork. Also update the inline
`<link rel="apple-touch-icon">` if you point it somewhere else.

The contamination scan checks binary **filenames** only — it cannot look at
pixels. Replacing icons is a human step and nothing will remind you.

## 5. Sync

```bash
npm run config:sync
```

This writes the identity into the document head, `manifest.webmanifest`,
`sw.js` and `package.json`. From here on, `npm run verify` fails if any of them
drifts.

## 6. Write down what the product does

Before touching code. What are the nouns? What does someone do first? What must
never be lost? The starter exists so this is where the time goes.

## 7. Replace the demo domain

The foundation reaches your product through exactly **four seams**, declared
together just above the demo:

```js
const Domain = {
  hydrate(){},   // read your state out of Store
  render(){},    // paint your screens
  wire(){},      // attach your own listeners, once, at boot
  tabIcons: {}   // { <data-tab value>: '<svg path markup>' }
};
```

They default to no-ops, so **you can delete the demo and the app still boots**
into a working but empty shell. Nothing else in the foundation names anything
the demo defines — a contract enforces that.

In `index.html`, the section from `DEMO DOMAIN — Item` down to
`SETTINGS — data ownership` is the demo. Delete it wholesale, then assign your
own four seams in its place.

Also replace, in the body markup:

- the `.view` blocks and the tab bar (use only as many tabs as you need — the
  markup is the single source of which tabs exist)
- `itemDetailOverlay` and `itemFormOverlay`
- the `Components` overlay, once you no longer need the gallery

Keep: the overlay engine, storage, migration, backup import, toast,
confirmation, icons, navigation, boot, and the Backup & data page. None of
them know what an Item is.

## 8. Define the data architecture

Add your keys to `KEYS`, under the existing namespaces:

```js
const KEYS = {
  schemaVersion:  'sys.schemaVersion',
  backupPrefix:   'sys.backup.',
  lastSeenUpdate: 'ui.lastSeenUpdate',
  accounts:       'data.accounts',
  accountDraft:   'draft.account'
};
```

Never write a key outside the adapter, and never a bare generic name.

Leave `DATA_SCHEMA_VERSION` at 1 until your data ships. After that, bump it and
add a migration whenever the *shape* changes — not when values change.

If you add a top-level `const`/`let` that a test needs to reach, add its name
to `BRIDGE` in `test/harness.js`.

## 9. Write domain contracts

Keep the starter's contracts green throughout — they are your regression net
for the foundation. Add your own for the product's rules, in the same style:
name the failure the contract prevents, not the code it calls.

Update `scripts/contamination.js` only to *narrow* a pattern that legitimately
collides with your domain vocabulary, and say why in the comment.

## 10. Reset the release history

Replace `APP_UPDATES` with a single entry for your product's first release.
Keep the authoring comment above it — it is the part worth having.

```js
const APP_UPDATES = [
  { id: 'v0-1-0', version: '0.1.0', title: 'First release',
    date: '2026-01-01', summary: '…',
    newFeatures: ['…'], improvements: [], fixes: [] }
];
```

The newest entry **is** the app version, and the cache name derives from it. To
ship a release: add an entry, run `npm run config:sync`, verify, deploy.

## 11. Adapt the documentation

Your product inherits five documents written *about the starter*. Shipping them
unchanged means shipping a product that describes itself as a starter.

| File | Do this |
|---|---|
| `README.md` | **Rewrite.** It currently describes app-starter. Yours should say what your product is, how to run it, how to verify it. |
| `NEW-PROJECT.md` | **Delete.** You have already followed it. It is instructions for creating a product, not documentation of one. |
| `PRODUCT-DESIGN.md` | **Keep**, and add to it. The rules apply to your product; the enforced ones are still enforced. |
| `STARTER-ARCHITECTURE.md` | **Keep and rename** (e.g. `ARCHITECTURE.md`). Update the demo-domain section to describe your domain. The foundation half stays true. |
| `CLAUDE.md` | **Keep.** Add your product's own rules underneath. |

A contract fails if you kept the starter's release history (step 10); nothing
can check your README for you, so do it here.

## 12. Verify

```bash
npm run verify
```

Contracts, identity integrity, and the residue scan. Green before every commit.

## 13. QA on a real device

**Mandatory before any production release.** A browser at a narrow width does
not test any of this. On an actual phone:

- [ ] Load the deployed URL in the device's own browser.
- [ ] **Install the PWA** — Add to Home Screen.
- [ ] **Launch standalone** from the icon; confirm no browser chrome.
- [ ] **Safe areas** — nothing under the status bar, notch, or home indicator,
      on every screen and every overlay.
- [ ] **Keyboard** — open every form; the page must not zoom on focus, and the
      field you are typing in must stay visible.
- [ ] **Navigation** — every tab, every detail page, the device back gesture.
- [ ] **Overlays** — open, nest, dismiss; the page behind must not scroll.
- [ ] **Refresh and resume** — reload mid-task, background the app and return;
      unsaved input must survive.
- [ ] **Service-worker update** — ship a new version, reload twice, confirm the
      new code is served and the old cache is gone.
- [ ] **Offline shell** — enable airplane mode and reload; the app must open.
- [ ] **Rotate to landscape** on every screen.
- [ ] **Reduce Motion** on in system settings; confirm nothing animates.
- [ ] Six viewports if you also test in a browser: 375×812, 390×844, 932×430,
      844×390, 812×375, 667×375 — zero horizontal overflow on each.

> The starter itself has never had steps 2, 3 and 10 of this list observed on
> real hardware — the development environment blocks service-worker
> registration. The first product to deploy is the first real proof. Treat any
> failure here as a starter defect and upstream the fix.

## 14. Deploy

GitHub Pages: Settings → Pages → Branch `main`, folder `/ (root)`.

Your app lives at `https://<you>.github.io/<your-product>/`. Every path in the
app is relative, so the sub-path needs no configuration.

After the first deploy, confirm in DevTools → Application:

- **Cache Storage** shows `<APP_ID>-v<version>` and nothing else.
- **Local Storage** shows only keys prefixed `<APP_ID>.`
- **Manifest** shows your name, short name and colours.
- **Service Workers** shows a scope limited to your project path.

If another of your apps is deployed on the same account, open both and confirm
each still has its own data after visiting the other.

---

## Things people get wrong

- **Editing `sw.js` or the manifest by hand.** They are derived. Edit
  `APP_CONFIG` and run `config:sync`.
- **Adding a second `<script>` block.** The test harness only sees the largest
  one; everything in the second is untested and the suite still passes.
- **Adding a lock/unlock pair to a new overlay.** The engine already does it.
  A hand-rolled pair reintroduces exactly the bug the engine exists to prevent.
- **Reaching for `localStorage` directly.** Use the adapter, or the key is
  unnamespaced and collides.
- **Keeping the demo "for reference".** Delete it. Git has it.
- **Hard-coding a font size or family.** The contracts will fail, and they are
  right to.
