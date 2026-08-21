# Gi V5 Configurator — Design Review & Fixes

Review of the `gi-v5` configurator shell, the fourth iteration of the
minimal Gi design built 2026-08-19/20. Reviewed 2026-08-21 against
`dev` @ `b4cae10`; fixes landed on
`claude/configurator-design-review-p3300p` as `1febec0` and `3557a55`.

Preview: `/configurator/gi-v5` (the `dev--` Netlify branch deploy serves
whatever is on `dev`).

## What v5 is

A fixed horizontal rail of labelled ⊕ markers (Kimono / Belt / Pant) at
bottom center. The garment starts completely clean; tapping a ⊕ reveals
that part's hotspots and docks its menu above the rail. Tapping again, or
tapping the background, hides them. Leader lines from the rail to the
model were tried and removed — the labelled buttons read clearly alone.

Four corners carry the rest of the app: burger (top left) opens **Your
Studio**, the customer's personal drawer; the bag (top right) opens an
order summary; an AI bubble (bottom left) launches the design assistant;
Chatra (bottom right) is live chat. A first-load choreography names all of
it in five beats.

### Lineage

| | Files | Introduced |
|---|---|---|
| `gi-v2` | `anchors.ts`, `hotspots.tsx`, `v2-panels.tsx`, `v2-shell.tsx` | Anchor system + hotspot markers on the model |
| `gi-v3` | `quiet-hotspots.tsx`, `anchor-panel.tsx`, `use-resolved-anchors.ts` | "Quiet" hotspots, resolved-anchor hook |
| `gi-v4` | `v4-shell.tsx` | Shell iteration |
| `gi-v5` | `v5-shell.tsx`, `zone-color-menu.tsx`, `burger-drawer.tsx`, `cart-drawer.tsx` | Current design |

All four are registered side by side in `configurators/registry.ts` for
comparison. v5 is `'gi-v5'` at line 36.

### Architecture note

v5 does not fork the pipeline. It reuses `gi/gi-canvas`, `gi-v3`'s
quiet-hotspot layer and `use-resolved-anchors`, the shared size options,
and `createGiMinimalConfigurator` from `gi-v2` for state, autosave, cloud
save and the whole add-to-cart flow. The cart drawer deliberately mirrors
the live site's `PriceSidebar` row construction. Only the shell — the
hotspot presentation strategy — is new.

## Findings

Eleven issues, reviewed at code level. Ten are fixed; one is a design
decision left open.

### Bugs

**1. The intro hijacked the customer mid-interaction.** ✅ Fixed

The 4600ms beat was guarded only by `introDoneRef`, which a rail tap or a
tap on the intro overlay set. `handlePointerDown` set `hintsCancelledRef`
— which guards beats 4 and 5 — and never touched `introDoneRef`. The
burger and bag sit at `z-40`, above the `z-[25]` dim, so they stay
tappable during the intro. Opening the studio drawer at 2s meant the
Kimono menu force-opened behind it at 4.6s, dragging the camera along.

A pointer-down anywhere now ends the whole intro, and the beat checks both
guards.

**2. A destructive confirm survived closing the drawer.** ✅ Fixed

`GiV5BurgerDrawer` is rendered unconditionally by the shell and bails with
`return null` *after* its hooks, so it never unmounts and its state
persists. Tapping "Start a New Design" once, closing, and reopening later
left the row still armed — one tap then deleted the draft and reloaded.
`shareState` stuck around the same way, resurfacing a stale share URL.
Both now reset when the drawer closes.

**3. The custom-size sheet could not escape its parent.** ✅ Fixed

`SizeMatrix` opened `fixed inset-0`, but two ancestors establish a
containing block for fixed-position descendants: the rail wrapper's
`-translate-x-1/2` and the menu's own `backdrop-blur-2xl`. Per spec, both
`transform` and `backdrop-filter` trap `position: fixed`. So `inset-0`
resolved against the small menu box rather than the viewport. This control
exists specifically to avoid Android Chrome's fullscreen native `<select>`,
so the platform it was built for was the one where it broke.

It now portals to `<body>`.

### Accessibility

**4. No reduced-motion handling anywhere in the app.** ✅ Fixed

`grep -rn 'prefers-reduced-motion'` returned nothing across
`configurator-app/`. v5 adds three infinite animations — `dspln-v5-ring`
on every rail button and `dspln-v5-intro-bob` on the arrows — plus a
17-second scripted sequence. The infinite pulse is a WCAG 2.2.2 issue.

The media query now disables the pulse, the bobbing arrows and the
drop-in, and the intro timeline is skipped outright: an auto-advancing
tour is a timing problem as much as an animated one.

**5. The drawers were not dialogs.** ✅ Fixed

Neither drawer had `role="dialog"`, `aria-modal`, a focus trap, or
Escape-to-close. The backdrop is a `<button>`, so keyboard users tabbed
straight through it into the configurator behind the dim. Both now share
`use-drawer-dialog.ts`: role and `aria-modal`, focus moved in on open and
restored on close, a Tab trap, and Escape.

### Design

**6. The intro runs on every page load.** ⬜ Open — your call

17 seconds of choreography for someone who reloads to keep working. This
is a deliberate decision (`6c0bc0b`, "run intro choreography on every page
load"), so it was left alone rather than quietly reverted. Reduced-motion
users now skip it, and fix #1 removes the harm of it firing while the
customer is busy.

If it should become first-visit-only, the shape is a `localStorage` flag
plus a "replay tour" row in Your Studio, so it stays discoverable.

**7. The add/remove chip stated an action while describing a state.** ✅ Fixed

On an included Kimono, the *active white chip* read "Add Kimono +$55",
which looks like the button that adds it. The current segment now names
the state ("Included · $55"), the other names the action ("Remove").

**8. The corner tour could point at empty corners.** ✅ Fixed

Chatra is skipped when embedded (`window.parent !== window`) because the
Shopify parent page owns the widget, but beat 3 still said "Questions?
Chat with us" with an arrow into an empty corner. Same for the AI bubble
under `?assistant=0`. The tour is now built from the corners that actually
rendered.

**9. Money was formatted three different ways.** ✅ Fixed

The rail said `+$55`, the bag `$115`, the summary `$55.00` — the same
total reading two ways on two surfaces. One `formatUsd` helper now serves
all three: compact in the always-on chrome where the label is 8–10px,
cents wherever the price is itemized, which is what the live site's
sidebar does.

**10. The summary drawer's side inset was 112px.** ✅ Fixed

`px-14` on a 360px phone left ~248px for label-and-price rows that already
truncate at 10px. Now `px-6`.

**11. The rail's attract pulse never stopped.** ✅ Fixed

Once the tour has named the rail, a permanent pulse on all three buttons
is noise. It now retires after the first interaction.

## Your Studio — Phase 2

The burger drawer shipped 2026-08-20 (`f91afc5`) as Phase 1, with its own
docstring noting "Inline design/upload lists come later." Both top rows
linked out to `/pages/my-designs` and `/pages/my-logos` — leaving the
configurator mid-design, which is exactly what a personal hub should not
require.

They are now collapsible sections with counts, each keeping the account
page as a footer link.

**My Designs** merges local IndexedDB drafts (`listSavedGiDesigns`) with
the customer's cloud designs (`listGiCloudDesigns`) when signed in, newest
first, cloud winning on id collisions since that is the copy they can
share. A row restores the design through the same `hydrate` path the v1
rail uses, landing on v5's `'front-far'` resting framing rather than the
default `'front'`. The bin needs two taps and clears on blur; it deletes
the local draft and the cloud record together, the pair the v1 rail
already deletes.

**My Uploads** reads `useUploadedLogos` — every image applied right now
plus every image embedded in a saved design. Tap a tile, pick a placement
from `APPLY_TARGETS`, and it applies and closes the drawer.

No new plumbing was needed; all of it already existed for v1.

| Need | API |
|---|---|
| Local saved designs | `gi-draft-storage.ts:231` `listSavedGiDesigns()` |
| Cloud designs | `gi-cloud-designs.ts:329` `listGiCloudDesigns(context)` |
| Delete cloud record | `gi-cloud-designs.ts:468` `deleteGiCloudDesign()` |
| Uploaded artwork | `use-uploaded-logos.ts:28` `useUploadedLogos()` |
| Placement targets | `use-uploaded-logos.ts:29` `APPLY_TARGETS` |

## Verification

`tsc -b` and `vite build` both pass.

Behaviour was checked in headless Chromium at 390×844, not just read:

| Check | Result |
|---|---|
| Rail renders | 3 buttons |
| #1 — open studio drawer at 2s, wait past 4.6s | Drawer survived; no forced menu, no camera move |
| #3 — size sheet geometry | `parentElement === document.body`, 390×844 on a 390×844 viewport |
| #5 — dialog semantics | `[role="dialog"][aria-modal="true"]` present; Escape closed it |
| Phase 2 populated state | 2 seeded designs listed with names and timestamps, 1 upload tile |
| Delete confirm | First tap arms, does not delete |
| Placement picker | Targets offered and applied |

The 252 `Failed to fetch` console errors seen in this environment are
**pre-existing and environmental** — an identical count was measured
against unmodified v5. They are the sandbox blocking
`gstatic.com` (the Draco GLB decoder) and `call.chatra.io`. The 3D model
does not render here for that reason.

## Files

```
configurator-app/src/components/configurators/gi-v5/
  v5-shell.tsx          737   shell, rail, intro choreography, corners
  burger-drawer.tsx     652   Your Studio — designs, uploads, share, reset
  zone-color-menu.tsx   348   all-zones colour menu + size sheet
  cart-drawer.tsx       274   order summary + add to cart
  use-drawer-dialog.ts   55   new — modal semantics shared by both drawers
  index.tsx              15   factory wiring
  money.ts               12   new — one money formatter
```

Diff against `b4cae10`: 6 files, +628 / −99.

## Status

The two commits are on `claude/configurator-design-review-p3300p`, **not
on `dev`**, so the `dev--` preview still serves the old code until they
are merged.
