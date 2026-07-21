# DSPLN Shopify Theme Handoff

## Purpose

This repo is the clean Shopify theme direction for the DSPLN DTC storefront.

The goal is to stop patching configurator behavior into scattered live-theme files and instead build a dedicated DSPLN Shopify theme that owns storefront presentation while the configurator platform owns configurator logic.

This theme should be developed and previewed safely before anything is published.

## Hard Rules

- Do not publish this theme without explicit approval.
- Do not manually deploy Netlify or Shopify changes.
- Do not edit the current live Shopify theme directly from this work.
- Do not move 3D configurator business logic into Liquid.
- Do not change live product handles, variants, prices, checkout property names, or order metadata names without explicit approval.
- Tech pack generation must never be customer-facing. It is admin/factory-only and should happen only after an order is placed.

## System Split

DSPLN has two separate systems:

1. DTC Shopify site
   - Customer designs a product on dspln.com.
   - Customer adds it to cart.
   - Cart/checkout show clean customization info.
   - After purchase, the order should include useful fulfillment links.
   - Admin/factory workflow can access the 3D design and tech pack.

2. B2B print-on-demand app
   - Shopify store owner logs into DSPLN app.
   - They create/customize a product inside the app.
   - They save/publish that product to their Shopify store.
   - Orders flow back to DSPLN app for fulfillment.

This handoff is only about the DTC Shopify theme.

## Theme Responsibility

The Shopify theme owns:

- Product page templates
- Liquid sections/snippets
- Cart line item rendering
- Theme CSS
- Shopify storefront presentation
- Future account/admin-adjacent storefront surfaces if needed

The Shopify theme does not own:

- 3D model state
- Configurator UI logic
- Upload handling
- Save/load design logic
- Preview image generation
- Tech pack generation logic
- Product-specific customization rules

Those belong in the configurator platform/backend.

## Product Page Architecture

Use native Shopify product templates for configurator product pages.

Do not create separate Liquid implementations for every product.

Pattern:

- One shared section:
  - `sections/dspln-configurator-product.liquid`
- Product-family JSON template:
  - `templates/product.dspln-gi-configurator.json`
- One shared stylesheet:
  - `assets/dspln-configurator.css`

Each JSON template configures the shared section with:

- configurator platform origin
- configurator route slug
- product family
- customization mode
- product group label
- iframe height

This lets Gi products share one clean product-page system.

## Customization Modes

The current fresh Dawn build includes one customization style:

1. Color/logo customization
   - Example: Gi configurator
   - Customer chooses sizes, colors, uploads logos, optional belt text.
   - Product is not fully sublimated.

The Shopify theme should understand the product family/mode only enough to route the iframe and render cart/order presentation. It should not implement the actual customization logic.

## Work Already Done Locally

The following local-only changes were made in this repo:

### Added Gi product template

File:

- `templates/product.dspln-gi-configurator.json`

Purpose:

- First reusable product-page template for Gi products.
- Uses the shared `dspln-configurator-product` section.
- Points to the Dawn-local configurator platform origin while developing:
  - `http://127.0.0.1:3002`
- Uses:
  - `configurator_slug: gi`
  - `product_family: gi`
  - `customization_mode: color-logo`
  - `product_group_label: Custom Gi`

### Updated shared configurator section

File:

- `sections/dspln-configurator-product.liquid`

Changes:

- Added `product_family`.
- Added `customization_mode`.
- Added `product_group_label`.
- Added these values to the iframe URL as query params:
  - `productFamily`
  - `customizationMode`
  - `productGroup`
- Preserved Shopify product context query params:
  - `shopifyProductHandle`
  - `shopifyProductId`
  - `variantId`
  - `themeProductTemplate`
- Added section data attributes for product family and mode.

### Updated configurator CSS

File:

- `assets/dspln-configurator.css`

Changes:

- Made the iframe shell behave more like a full configurator workspace.
- Removed extra padding around the iframe.
- Increased max width.
- Kept stable desktop/mobile min heights.

### Updated theme plan

File:

- `DSPLN_THEME_PLAN.md`

Changes:

- Added product-family template plan.
- Documented that the Liquid section should stay generic.

## Current Local Verification

JSON templates were validated locally with Node.

No Shopify preview was completed because Shopify CLI authorization expired.

No commit, push, deploy, or publish was done for these latest theme changes.

## Stores & Deployment Pipeline

Two Shopify stores:

- **DEV store: `dspln-dev-2.myshopify.com`** — syncs its theme from the
  `dev-store-theme` branch (mirrored from `dev` by
  `.github/workflows/mirror-dev-theme.yml`). All review happens here.
- **LIVE store: dspln.com (`f39242.myshopify.com`)** — syncs from
  `main-store-theme` (mirrored from `main` by `mirror-live-theme.yml`).

Pipeline (Dev Store First, per AGENTS.md): feature branch → merge to
`dev` → review on the DEV store → only after explicit approval, merge to
`main` → live mirror. Promotion to live requires the words "promote to
live" after a dev-store review — never inferred from anything less.

## How To Preview Safely

Use Shopify CLI theme dev. This creates a temporary preview and does not publish the theme.

Command:

```bash
cd "/Users/a/Documents/Codex/DSPLN /dspln-shopify-theme"

env PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx @shopify/cli@latest theme dev --store f39242.myshopify.com
```

Shopify may ask for device authorization.

After authorization, Shopify CLI should provide a preview URL.

To test the Gi template, use a product URL with:

```text
?view=dspln-gi-configurator
```

Example:

```text
/products/mens-custom-gi-suit-2?view=dspln-gi-configurator
```

Exact product handle should be confirmed from Shopify.

## Next Recommended Steps

1. Get Shopify CLI preview working.
2. Assign/test the Gi template on duplicate/test Gi products only.
3. Verify iframe sizing and mobile behavior.
4. Build the shared cart line item renderer.
5. Only after the Gi page and cart pattern are solid, decide which future product group should be added intentionally.

## Cart Direction

The cart should eventually use one shared renderer for DSPLN custom line items.

Recommended future file:

- `snippets/dspln-line-item-properties.liquid`

It should:

- Show a beautiful visual customization summary.
- Show preview thumbnail if available.
- Show customer-relevant customizations.
- Hide confusing machine/internal keys from the customer-facing cart.
- Preserve hidden line item properties for backend/admin/order workflows.

## Shopify Admin Order Direction

Shopify admin line item information should keep the long customization list, then include the useful fulfillment links per item:

- link to open/view the 3D configurator design
- link to view/download the tech pack
- optionally keep `_dspln_production_url` if it is useful as the production/editable design URL

Do not reduce admin information to only links. The long customization list is still useful.

## Tech Pack Direction

The Gi tech pack work was valuable and should be preserved conceptually, but it must not be customer-facing.

Correct flow:

- customer places order
- order data contains the completed configuration
- backend/admin process generates or exposes tech pack
- Shopify admin/factory operator can access tech pack link

Do not add a "Generate Tech Pack" button to customer-facing product pages.

## Pantone / Logo Color Detection

Leave Pantone/logo color detection out of production.

We tested this heavily and it was not reliable enough. It should not be included in the Gi tech pack generator or Shopify theme until it is solved separately.

Preserve any color-detection experiments off to the side only. Do not wire them into production product pages, carts, checkout, orders, or tech packs.

## Mental Model

The clean architecture is:

```text
Shopify Theme
  owns product page shell, cart display, native Shopify presentation

Configurator Platform
  owns 3D design UI, product rules, uploads, save/load, add-to-cart payload

Backend / Admin Workflow
  owns order-time tech packs, factory files, production links
```

This keeps future products easier:

- add a JSON product template
- choose product family/mode/settings
- reuse shared product page section
- reuse shared cart renderer
- keep product-specific logic inside the configurator platform
