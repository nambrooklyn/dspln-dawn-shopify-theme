# V5 Gi Configurator — Go-Live Status

Written 2026-08-22 ~19:00 UTC, mid-launch, at Nam's request. This records
exactly what has been done, what is in flight, and the single step that
remains. Any session or agent can finish the job from this file alone.

## The goal

Serve the **v5 Gi configurator** (`gi-v5` shell) on the live store's
**Mens Custom Gi page — `dspln.com/products/customgi` — MOBILE ONLY**
(≤749px). Desktop keeps the v1 configurator. No other product, template,
or configurator changes behavior.

## The release route (the approved process)

1. Changes on `dev`
2. GitHub pipeline runs (Netlify dev rebuild + dev-store theme mirror)
3. Review on the Shopify development store
4. Merge `dev` → `main`
5. `main` auto-deploys: Netlify production + live-theme code mirror

## What is DONE

- **PR #20 merged into `dev`** (`2f860fcb`) — this session's work:
  - v5 review fixes (intro hijack, trapped size sheet, reduced-motion,
    dialog a11y, money formatting, corner tour, etc. — see
    `GI_V5_DESIGN_REVIEW.md`)
  - Your Studio drawer Phase 2 (inline My Designs / My Uploads)
  - The mobile-only switch: `sections/dspln-configurator-product.liquid`
    gained optional `mobile_configurator_slug` (and an optional, unused
    `mobile_platform_origin`). Blank = byte-identical behavior. The repo's
    Gi template sets `mobile_configurator_slug: "gi-v5"`.
- **PR #21 merged: `dev` → `main`** (`c3b50c50`, ~18:55 UTC). This is the
  production promotion. It carries the whole dev candidate: gi-v2…v5
  shells, shared gi camera changes, design-assistant updates (all
  configurators import it), rashguard-v2 (unrouted), section switch.
- Automatic consequences of that merge (no action needed):
  - **Netlify production** (`dspln-dawn-shopify-theme.netlify.app`,
    builds `main`) rebuilds → `/configurator/gi-v5` becomes servable on
    the production origin.
  - **`mirror-live-theme` workflow** pushes code files (including the
    updated section liquid) to `main-store-theme`, the branch the live
    Shopify theme syncs from. Templates do NOT mirror — they are owned by
    the store branch.

## What REMAINS (one step + verification)

1. **Verify the production bundle serves gi-v5** before flipping:
   fetch `https://dspln-dawn-shopify-theme.netlify.app/configurator/gi-v5`,
   take the `assets/index-*.js` filename from the HTML, and grep the JS
   for `gi-v5`. (Build was still propagating when work stopped.)
2. **Flip the live template** — the ONLY remaining change:
   add to `templates/product.gi-configurator-product-page.json` on the
   **`main-store-theme` branch** (NOT main; templates are branch-owned),
   inside the `dspln-configurator-product` section's settings:
   ```json
   "mobile_configurator_slug": "gi-v5",
   ```
   `platform_origin` stays as-is (production origin). Push; Shopify syncs
   within moments. Alternatively set the same field in the theme editor:
   Mens Custom Gi product page → DSPLN configurator section →
   "Mobile configurator slug (optional)".
3. **Verify live**: `dspln.com/products/customgi` HTML should contain
   `data-mobile-configurator-path="/configurator/gi-v5"`. On a phone the
   v5 rail shell loads; on desktop v1 is unchanged.

## Rollback

Clear the `mobile_configurator_slug` field on the Gi template
(theme editor or a commit to `main-store-theme`). Takes effect next page
load. Desktop was never touched. Both shells share the same cloud design
store, so signed-in customers' designs open in either shell.

## Notes / history of this launch

- A side-channel attempt (`live-v5` pinned Netlify branch deploy) was
  abandoned: Netlify only publishes allowlisted branches (only `dev` is
  set up, via the `NETLIFY_DEV_BUILD_HOOK` GitHub Action). The `live-v5`
  branch still exists on GitHub with a workflow tweak (build-hook
  `trigger_branch` support, also merged to dev/main via PR #20's
  workflow file? — no: that tweak lives only on `live-v5`). The branch is
  now unnecessary and can be deleted.
- `stage-main` / `stage-live-theme` local staging branches from earlier
  plans are obsolete; the pipeline route replaced them.
- Earlier this session (unrelated to v5): Shop sales channel uninstalled
  from the live store (verified by API); live store confirmed on CLASSIC
  customer accounts; Login-with-Shop pinned off in the login template
  (now on main via the promotion).
- Session branch with all work + docs: `claude/configurator-design-review-p3300p`
  (also contains `GI_V5_DESIGN_REVIEW.md`).

## Key facts for whoever finishes this

- Live theme = GitHub branch **`main-store-theme`** (code mirrors from
  main automatically; templates/settings_data are branch-owned).
- Netlify production builds **`main`**; the dev deploy builds `dev` via a
  build-hook GitHub Action, not native CD.
- Live product: "Mens Custom Gi Suit", handle `customgi`, template
  `gi-configurator-product-page`, embed slug `gi` (v1).
- The section decides mobile once per page load via
  `matchMedia('(max-width: 749px)')`; no reload on resize.
