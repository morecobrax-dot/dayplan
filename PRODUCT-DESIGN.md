# Product design

The rules this foundation encodes. They are not preferences — each one is here
because ignoring it produced a real defect in a real shipped product.

Where a rule is enforced by a test, that is noted. The rest are judgment, and
judgment is what code review is for.

---

## Mobile first, on real devices

Design for a phone held in one hand, then let it widen. A desktop screenshot
proves nothing: the failures are the notch, the home indicator, the software
keyboard, the rotation, and the thumb.

- Editable inputs render at **16px minimum**. Below that, Safari on iOS zooms
  the page on focus and does not zoom back out. *(enforced)*
- Actionable targets are **at least 44px**. The visible mark can be smaller —
  the target is what must not be. *(enforced)*
- Safe-area insets are read on **all four edges**. Left and right matter in
  landscape, which is where most implementations discover they forgot. *(enforced)*
- Automatic text inflation is off, pinch zoom is not. Turning off zoom entirely
  removes an accessibility affordance to fix a layout bug. *(enforced)*
- Landscape reclaims vertical space rather than clipping content. *(enforced)*

## One obvious primary action

A screen with five equal buttons has no primary action, and every tap becomes a
decision. Give the workflow's forward action the weight; let everything else
recede.

- The primary action takes the room; the secondary yields.
- A destructive action does **not** wear the loud button. If confirming a
  deletion is the most prominent thing on screen, the design is pushing toward
  the outcome nobody wants. *(enforced)*
- An action that only makes sense at the end of a flow exists only at the end
  of it. Offering "finish" on step one puts the loudest control on screen
  against the thing that has not been done yet.

## Two surfaces, and only two

- A **sheet** is a decision or a short form. It rises from the bottom, carries
  buttons, and is dismissible where nothing would be lost.
- A **page** is a destination you navigate into. It fills the screen, carries a
  back control sized like navigation, and answers the device back gesture.

Refusing to invent a third surface type is what keeps an app with dozens of
overlays feeling like one app. If something does not fit either, the
information hierarchy is usually the real problem.

## Progressive disclosure

Beginners see simplicity. Depth appears when it is asked for.

Optional things stay optional and say so. A step that can be skipped is
skippable without penalty, and skipping is a visible, ordinary choice — not a
hidden one.

## Hierarchy before decoration

If a screen is unclear, the fix is grouping, spacing, weight and order — not
another gradient, another border, another card.

**No card soup.** Reach for typography, whitespace, grouping and a divider
before another container. A page where everything is in a card is a page where
nothing is emphasised.

Colour carries state, never decoration. And it never carries state *alone*: a
status shows a word and a shape as well as a hue. *(enforced)*

## One control, one predictable result

- A visible control must work. A tap that does nothing — because its target is
  inside a hidden parent, or painted underneath the surface above it — is worse
  than a disabled control, because it teaches distrust.
- Validate before mutating. Clearing state and *then* discovering the target is
  missing leaves a screen nothing can recover. *(enforced)*
- The same tap gives the same result. A tab opens at its top rather than
  wherever it was left. *(enforced)*
- Motion respects `prefers-reduced-motion`, everywhere, not on the animations
  someone remembered. *(enforced)*

## Truth over impressive fiction

- If storage cannot persist, say so on screen. Do not let someone discover it
  by losing their work. *(enforced)*
- A write is only "saved" if it landed. The storage adapter returns a real
  boolean for exactly this reason. *(enforced)*
- Unknown is a legitimate state. An empty field is unknown, not zero, and it is
  never "repaired" with a plausible default. *(enforced)*
- Do not fabricate precision — a score, a projection, a confidence — that the
  data cannot support.
- Empty states say what the area is and offer one action. They do not pretend
  to be full.

## No parallel sources of truth

- Derive; do not duplicate. The app version *is* the newest release entry. The
  cache name *is* derived from `APP_ID` and that version. The storage prefix
  *is* derived from `APP_ID`. *(enforced)*
- Do not persist what can be derived. Store the historical record; compute the
  presentation. A stored total is a total that can disagree with its parts.
- Drafts live outside committed data. That separation is what makes a
  half-finished record structurally incapable of being counted. *(enforced)*

## One mechanism, not N remembered pairs

The single most valuable architectural rule here.

Anything that must happen for *every* instance of something — locking the page
behind an overlay, restoring focus, ordering what paints on top — is
implemented **once**, driven by observed state, never as an open/close pair
that each new surface has to remember. A pair can be forgotten by the next
person. An observer cannot. *(enforced: exactly one observer)*

## Accessibility is structural

Not a polish pass.

- Semantic elements: `nav`, `main`, real `button`s.
- Every icon-only control has a label. *(enforced)*
- State is exposed, not just painted: `aria-selected`, `aria-checked`,
  `aria-invalid`, `aria-modal`. *(enforced)*
- Errors are announced and tied to their field. *(enforced)*
- Focus is visible, trapped inside a dialog, and returned to the control that
  opened it — if that control still exists. *(enforced)*
- Hidden-but-available content uses a clip technique, not `display:none`.

## Premium means restraint

Premium is hierarchy, deliberate spacing, clear actions, useful contrast,
coherent depth and predictable interaction.

It is not gradients everywhere, glow everywhere, endless cards, decorative
animation, or grey text on grey.

Spend emphasis in one place per screen and keep everything around it quiet.
One accent gradient, used only where forward motion is meant — never as
ornament.

## Root cause over UI patch

If a control is being tapped twice, find out why the first tap did nothing.
Hiding a symptom moves the bug rather than removing it, and the next person
inherits both.

**Write the reason, not the change.** When a non-obvious decision is made,
record the failure that caused it. Every unusual line in this codebase carries
one, which is the only reason it can be audited at all.

## Real-device QA before shipping

Install to the home screen. Test offline. Rotate it. Turn on reduced motion.
Open the keyboard on every form. Six viewports minimum, portrait and landscape.

A change that looks right in a desktop browser has not been tested.
