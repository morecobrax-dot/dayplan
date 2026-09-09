# Dayplan

A visual daily planner. It answers one question before any other:

> **What am I doing now, and what comes next?**

One HTML file, one service worker, one manifest, two icons. No framework, no
build step, no dependencies, no account, no server. Everything you create lives
on your own device.

---

## What it does

- **Today** — a vertical day timeline with a clock line that follows the real
  time. What is happening now, what follows it, and what is already done.
- **Plan** — the same day, editable. Press and hold a block to move it, drag its
  bottom edge to change how long it takes, and see the week's load beside it.
- **Inbox** — anything captured before you know when it happens. It waits there
  until you give it a time.
- **Auto Plan** — proposes a workable day around your fixed commitments and
  applies nothing until you say so.

### The distinction the whole product rests on

|  | Moves? | Auto Plan may place it |
|---|---|---|
| **Commitment** | A real appointment at a set time | Never |
| **Task** | Needs time, but can go anywhere it fits | Yes |

Either can repeat. Either can sit in the inbox with no time at all. Those two
kinds and those two flags are the entire model.

## What it will not do

- It will not move anything without asking.
- It will not tell you a day fits when it does not.
- It will not show a number the data cannot support.
- It will not claim a reminder it cannot deliver. See
  [PUSH-SETUP.md](PUSH-SETUP.md) for exactly what works today and what needs a
  server.

## Run it

```bash
npx --yes http-server -p 8181 -c-1 .
```

Then open `http://localhost:8181`. A service worker needs `http(s)`, so opening
`index.html` from disk works but will not exercise offline behaviour.

## Verify it

```bash
npm run verify
```

The one command to remember. It runs the contract suite, checks the static PWA
files still match `APP_CONFIG`, and scans for domain residue. Green before every
commit and every deploy.

```bash
npm test              # contracts only
npm run config:verify # identity drift only
npm run contamination # residue scan only
npm run config:sync   # write derived values into the static files
```

### What the contracts defend

Contracts 1–19 are the foundation: identity, storage namespacing, migrations,
the overlay engine, navigation, accessibility, the design system, the PWA.

Contracts 20–29 are this product:

| | |
|---|---|
| **20 · Time** | Runs the whole time layer under eight real timezones in child processes — half-hour DST, UTC+14, southern transitions. Every assertion in it passes in UTC; they are the ones that break for some users and not others. |
| **21 · Model** | A record is valid before it reaches a screen, and nothing derived is ever stored. |
| **22 · Recurrence** | Editing one day cannot rewrite the series. |
| **23 · Timeline** | The drawing cannot disagree with the data — geometry, overlap, cross-midnight, the clock line. |
| **24 · Drag** | A scroll is never a reschedule. |
| **25 · Auto Plan** | It proposes; only a person applies. A commitment never moves. |
| **26 · Reminders** | The product never claims more than it delivers. |
| **27 · Export** | A real calendar file, and it is never called a sync. |
| **28 · Tags** | A tag can change without invalidating the past. |
| **29 · Appearance** | Light and dark are one decision, and every colour used as text is *measured* against its ground. |

## Releasing

Add an entry to `APP_UPDATES` in `index.html`, run `npm run config:sync`, run
`npm run verify`, then deploy. The newest entry **is** the version, and the
service-worker cache name derives from it — skipping this ships an app that
cannot invalidate its own cache.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces fit and where things go.
- [PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) — the UX rules this codebase encodes.
- [PUSH-SETUP.md](PUSH-SETUP.md) — the notification decision, and the one thing
  that still needs an account.
- [CLAUDE.md](CLAUDE.md) — development method for AI coding sessions.

---

Built from a private local-first app foundation. The product owns its code:
there is no submodule, no package and nothing that pulls changes back in.
