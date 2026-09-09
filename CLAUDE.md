# Development method

Instructions for AI coding sessions in this repository. These override default
behaviour.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing architecture, and
[PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) before changing anything a user sees.
The product rules at the bottom of this file are not optional.

---

## Before implementing a new product

If you are starting a product from this foundation, in this order:

1. Read [PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) — the rules the UI must obey.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) — what already
   exists, so you do not rebuild it.
3. Read the product's own requirements. If there aren't any written down, ask
   for them before writing code.
4. Follow the foundation notes step by step.
5. **Separate foundation from domain before you type.** Name which parts of the
   change are product-specific and which are genuinely reusable.

### The foundation-modification rule

**A product-specific need stays in the product.** Do not change generic
foundation code because one product wants something. Add it in the domain
section, behind the `Domain` seams.

Only upstream a change to the foundation when it is reusable *on its own terms*
— when a second, unrelated product would want it identically. If you are
unsure, it is not reusable yet. Leave it in the product; it can be promoted
later, by hand, after a second product proves the need.

This rule exists so a savings app does not slowly turn a general foundation
into a finance framework. The same applies in the other direction: never add a
domain concept — a transaction, an account, a category — to the storage
adapter, the overlay engine, toast, confirmation, or navigation.

### No dependency linkage

A product created from this starter is **independent**. Never introduce a git
submodule, an npm package, a shared remote runtime, or any automation that
pulls starter changes into a product or pushes product changes back. Copy the
knowledge, then own the product.

## Workflow

```
AUDIT → UNDERSTAND → IMPLEMENT → ADVERSARIAL VERIFY → DIFF AUDIT → SHIP → REPORT → STOP
```

- **Audit** the existing code before proposing a change. Read the thing you are
  about to modify, and the thing that calls it.
- **Understand** why it is the way it is. Nearly every unusual line here carries
  a comment naming the failure that caused it. If you are about to remove
  something that looks redundant, find that comment first.
- **Implement** the requested change, and only that change.
- **Adversarially verify.** Try to break what you built. Repeat it a hundred
  times. Open it, close it, rotate it, refresh mid-edit, deny it storage.
- **Diff audit** before shipping. Read the whole diff. Every surviving line
  should have a reason to exist.
- **Report** what you did, what you verified, and what you did not.
- **Stop** at the requested phase. Do not begin the next one.

## Before changing anything

1. **Run the baseline first.** `npm run verify` before you start, so you know
   whether a failure is yours.
2. **Find the current source of truth before adding another one.** If you are
   about to declare a value, search for it first. Identity, tokens, storage
   keys, release history and overlay state each have exactly one owner, and a
   contract enforces it.
3. **Prefer extending an existing system to creating a parallel one.** A second
   overlay mechanism, a second storage wrapper or a second version constant is
   a defect, not an addition.
4. **Do not redesign unrelated surfaces during targeted work.** If you notice
   something else, say so; do not fix it in the same change.

## Hard rules

1. **New code goes in the largest inline `<script>` block.** A second block or
   a linked file is invisible to every contract, and the suite will still pass.
2. **Never hard-code a font size, font family, or colour.** Use the tokens. A
   genuine exception is marked `/* fs-exempt: reason */` on the lines above it.
3. **Never add a lock/unlock pair to an overlay.** The engine's observer handles
   scroll lock, focus, stacking and ARIA. A hand-rolled pair reintroduces the
   bug the engine exists to prevent.
4. **Never touch `localStorage` outside the storage adapter.** Anything else is
   an unnamespaced key and an origin collision waiting to happen.
5. **Never edit `sw.js`, `manifest.webmanifest` or the derived `<head>` block by
   hand.** Edit `APP_CONFIG`, run `npm run config:sync`.
6. **Never reference a path outside the repository** in application or tooling
   code. The starter is self-contained.
7. **No `alert()`, `confirm()` or `prompt()`.** Use `toast()` and
   `confirmAction()`.
8. **No new dependency, framework, or build step** without the user explicitly
   asking for one. The value here is proven behaviour, not stack novelty.

## Product rules

9. **Mobile first.** Design for a phone, then let it widen.
10. **≥44px actionable touch targets.** The visible mark may be smaller.
11. **≥16px editable inputs**, or iOS Safari zooms and does not zoom back.
12. **Respect safe areas** on all four edges, through the `--inset-*` tokens.
13. **Respect `prefers-reduced-motion`** on every animation, not most of them.
14. **One visible action, one predictable outcome.** Validate before mutating.
15. **Truthful empty and unknown states.** Absent is not zero. A missing key is
    a new user, not a corrupted one, and is never repaired with a default.
16. **No fake precision.** Do not present a number the data cannot support.
17. **Do not persist derived values.** Store the record; compute the
    presentation. A stored total can disagree with its parts.
18. **Preserve backward compatibility** wherever product data already exists.
    A shape change means a migration, not a reinterpretation.

## Testing

19. **Add regression coverage for every real defect**, in the same session that
    fixes it. Name the contract after the failure it prevents, not the function
    it calls.
20. **Run adversarial tests** — repetition, nesting, refresh mid-action, denied
    storage, corrupt input, empty and enormous collections.
21. **A contract that cannot be described as "this prevents X" should not
    exist.** Optimise for value, not for count.
22. **If you add a top-level `const`/`let` a test must reach**, add its name to
    `BRIDGE` in `test/harness.js`, or it will be invisible.

## Shipping

23. **Verify live behaviour**, not just the local file. Install it, load it
    offline, check the cache and storage names in DevTools.
24. **Compare the deployed bytes to committed source**, not to a
    line-ending-modified working copy — on Windows the working tree is CRLF and
    will report a false mismatch. Compare the git blob.
25. **Update `APP_UPDATES` on every real release**, then run
    `npm run config:sync`. The newest entry is the version; the cache name
    derives from it. Skipping this ships an app that cannot invalidate its own
    cache.
26. **`npm run verify` must be green before any commit or push.**

## Scope

27. **A product-specific need stays in the product.** See the
    foundation-modification rule above. Do not generalise on the first use.
28. **Stop at the requested phase.** Finish it completely, report, and wait.
    Do not start the next phase, do not "while I'm here", do not polish the
    demo into a product.

---

# Dayplan's own rules

These are on top of everything above. Each one is here because breaking it
produced a real defect in this repository, and the contract that now prevents
it is named in brackets.

## Time

29. **Never `new Date('<a civil date>')`.** A date-only string is parsed as
    UTC, so west of Greenwich it is the previous day — for every date, all
    year, for half of the people using it. Split it by hand. *[20]*
30. **Never add a day as `+86400000`.** A DST day is 23 or 25 hours long. Day
    arithmetic goes through the `Date` constructor, which normalises the
    calendar. *[20]*
31. **Never derive a duration by subtracting two instants.** 09:00 to 10:00 is
    sixty minutes on every day of the year. Durations are wall-clock minutes;
    instants are an output, never an input. *[20]*
32. **A civil date is `'YYYY-MM-DD'` and a time is minutes after local
    midnight.** They are not interchangeable and neither is a `Date`.

## The schedule

33. **An occurrence is computed, never stored.** Editing one day of a routine
    writes an `Override` keyed by series id *and* date. If you find yourself
    writing to the series from an occurrence edit, stop. *[22]*
34. **One predicate owns "can this move?"** — `isMovableOccurrence()`. This was
    two once, they disagreed, and Auto Plan scheduled straight over completed
    work. Do not add a second. *[25]*
35. **Auto Plan proposes.** Computing a proposal writes nothing. Applying is a
    separate act the person takes. A commitment never moves, a duration is
    never shortened to fit, and work that will not fit is reported with a
    reason rather than dropped. *[25]*
36. **Completion and time are different truths.** Completing something records
    when it happened and never touches when it was planned. The clock line
    follows the clock and nothing else. *[23]*
37. **Demand is the whole duration; only anchors are clamped to the window.**
    Clamping demand made the app call a day comfortable while Auto Plan could
    not fit the work. *[25]*

## Honesty

38. **Never claim a reminder the product cannot deliver.** A `setTimeout` chain
    is not a reminder system. Background delivery stays described as "not set
    up yet" until a notification has actually arrived on a locked phone. See
    [PUSH-SETUP.md](PUSH-SETUP.md). *[26]*
39. **Never label a deterministic rule engine "AI".** Auto Plan is a first-fit
    packer and is named accordingly. A real provider goes behind a server
    endpoint, and no key ever reaches the client. *[26]*
40. **An `.ics` export is an export.** Never call it a sync; nothing reads a
    change back. *[27]*

## Appearance

41. **Both palettes or neither.** Every colour token added to layer 1, 2 or 4
    is defined in the light block too. *[29]*
42. **A colour used as text is measured, not eyeballed.** The contract computes
    the ratio from the tokens; 4.5:1 for text, 3:1 for a rail or an icon. The
    clock label shipped at 4.17:1 until it was measured. *[29]*
43. **Appearance is resolved once**, into a literal `data-theme`. Never add a
    `prefers-color-scheme` block — that is a second owner for one decision. *[29]*

## Interaction

44. **A scroll is never a reschedule.** A gesture is a scroll until it proves
    otherwise: a deliberate hold on touch, a movement threshold on a mouse.
    Movement before the hold disarms the drag permanently for that gesture. *[24]*
45. **Suppress page scrolling only while a drag is live**, through the
    non-passive `touchmove` listener. Never put `touch-action: none` on the
    timeline. *[24]*
46. **Nothing floats over a control.** The add button covered the tick box
    once; the tick box moved to the leading edge. A visible control that
    cannot be tapped is worse than a disabled one.
