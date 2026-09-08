# Development method

Instructions for AI coding sessions in this repository. These override default
behaviour.

Read [STARTER-ARCHITECTURE.md](STARTER-ARCHITECTURE.md) before changing
architecture, and [PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) before changing
anything a user sees.

---

## Before implementing a new product

If you are starting a product from this foundation, in this order:

1. Read [PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) — the rules the UI must obey.
2. Read [STARTER-ARCHITECTURE.md](STARTER-ARCHITECTURE.md) — what already
   exists, so you do not rebuild it.
3. Read the product's own requirements. If there aren't any written down, ask
   for them before writing code.
4. Follow [NEW-PROJECT.md](NEW-PROJECT.md) step by step.
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
