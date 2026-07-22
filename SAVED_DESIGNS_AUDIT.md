# Saved-Designs Code Audit & Consolidation Plan

Every place the "save a design" feature lives in this repo
(`configurator-app/src/components/configurators/`), what state each copy is
in, and the organizational fixes to make. Audited 2026-07-22.

## Inventory — where saving happens today

### Gi-family configurators (six near-identical copies each of 3 files)

Each variant folder carries its own copy of `saved-designs-rail.tsx`
(~672–683 lines), `gi-cloud-designs.ts` (API client for
`/api/customer-designs`), and `configurator-action-rail.tsx` (the Saved
button), plus save/load/delete handlers inside its `index.tsx`.

| Variant | Save UI for signed-in customers? | Notes |
|---|---|---|
| `gi` | ✅ un-gated 2026-07-22 | rail 683 lines |
| `kids-gi` | ✅ un-gated 2026-07-22 | rail 672 lines; save panel was already the most customer-ready copy |
| `womens-gi` | ❌ studio-only | rail 672 lines |
| `mens-kimono` | ❌ studio-only | rail 683 lines |
| `mens-pant` | ❌ studio-only | rail 683 lines |
| `mens-belt` | ❌ studio-only | rail 672 lines |

The line-count differences (672 vs 683) are drift: copies have been
improved independently and no longer match.

### Rashguard-family configurators (partially consolidated already)

`long-sleeve-rashguard`, `short-sleeve-rashguard`, and
`adult-grappling-short` share `shared/rashguard-cloud-designs.ts`
(237 lines) — proof the shared-module pattern works — but each still has
its own save UI and handlers in `index.tsx`, still studio-gated.

### Backend (single, already shared)

- `netlify/functions/customer-designs.mjs` — one store
  (`dspln-customer-designs` Netlify Blobs) for all variants. Records carry
  `ownerKey`, `shopifyCustomerId`, `customerEmail`, `productHandle`.
- Consumers: every configurator variant, the cart thumbnail script
  (theme), and now The Locker's My Designs tab.

### Related single-copy pieces (fine as they are)

- `shared/studio-mode.ts` — owner-only studio gate (`?studio=1`).
- The Locker (`components/locker/`) — reads designs by customer email.
- Theme: `sections/dspln-configurator-product.liquid` passes
  `customerId`/`customerEmail`/`design` into every configurator iframe.

## Organizational fixes

1. **Finish the customer un-gating sweep (mechanical, this week).**
   Apply the gi/kids-gi pattern to: `womens-gi`, `mens-kimono`,
   `mens-pant`, `mens-belt`, `long-sleeve-rashguard`,
   `short-sleeve-rashguard`, `adult-grappling-short`.
   Pattern: Saved rail button renders when `isCustomer || isStudioMode()`;
   saved-designs panel renders for customers without the studio tools
   (camera tuner, uploads, text stay studio-only).

2. **Consolidate the gi-family save code into `shared/` (the real fix).**
   One `shared/saved-designs-rail.tsx`, one `shared/gi-cloud-designs.ts`,
   one `shared/configurator-action-rail.tsx`, parameterized by the product
   config each variant already owns. Kill ~6 × 700 duplicated lines.
   Use the newest copy (kids-gi's customer-aware rail) as the base.
   The rashguard family's `shared/rashguard-cloud-designs.ts` shows the
   pattern; fold it into the same module while at it.

3. **Adopt a "shared-first" rule for the next variant.** Before cloning a
   configurator folder for a new product, extract anything the clone would
   duplicate into `shared/`. Stops the drift at nine copies.

4. **Mirror the consolidation into the production configurator repo**
   (`dspln/dtc-configurator`) — this Dawn-local copy inherited the
   duplication from there. Treat the refactor here as the rehearsal, then
   port it.

5. **Harden `customer-designs.mjs`** (queued separately): verify the
   Locker's Customer Account API token server-side instead of trusting an
   email query parameter, and scope CORS. Do this once, in the one shared
   backend — a reason to consolidate before hardening.

6. **Guest-design claiming (feature debt, after 1–2):** saves made while
   logged out are keyed to a guest token and never appear in The Locker.
   On sign-in, offer to claim the browser's guest designs (the guest token
   is already stored client-side).

## Suggested order

1 now (unblocks universal customer saving) → 5 (security, small) →
2 as its own work cycle → 4 port to production repo → 3 as standing rule →
6 when account polish resumes.
