# Configurator Roadmap — architecture debt

Two structural items agreed 2026-07-15, after the belt-removal ("Part: NO")
work exposed the cost of the current layout:

## 1. Unify the tech-pack pipelines
- **Gi family** renders tech packs ON DEMAND (`/tech-pack/gi`): fast add-to-cart,
  no wasted renders on abandoned carts. Now reliable — capture waits for the
  model AND every decal texture (see `projected-decal.tsx` pending counter).
- **Rashguards / grappling short** still capture views AT ORDER TIME (v1):
  reliable but slows add-to-cart and freezes renders at order time.
- **Goal:** migrate the rashguard family to the on-demand pipeline so all six
  configurators share one architecture.

## 2. Deduplicate the gi-family copies
- `womens-gi/` and `kids-gi/` are near-full copies of the shared/mens code
  (part-sections, price-sidebar, shopify-cart-simulator, glb plumbing).
- Every fix currently lands 3×. The belt-NO work touched ~20 files where a
  shared version would have touched ~7.
- **Goal:** fold the copies into `shared/` with small per-garment config
  (sizes, rank swatches, model URLs), like `PRODUCT_CONFIG` already does.
