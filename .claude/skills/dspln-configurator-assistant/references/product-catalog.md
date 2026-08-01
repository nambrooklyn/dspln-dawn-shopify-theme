# Product Catalog — every real option, color, and price

Extracted from the shipped configurator code. If an option isn't listed
here, the configurator does not offer it — don't improvise.

## Products

| Product | URL | Base pricing |
|---|---|---|
| Mens BJJ Gi | dspln.com/products/customgi | Kimono $55 + Belt $15 + Pant $45 (each part optional) |
| Kids BJJ Gi | dspln.com/products/custom-kids-gi | same part prices |
| Womens BJJ Gi | dspln.com/products/womens-custom-gi-suit | same part prices |
| Long Sleeve Rashguard | dspln.com/products/custom-long-sleeve-rashguard | $65 flat |
| Short Sleeve Rashguard | dspln.com/products/custom-rashguard | $65 flat |
| Grappling Shorts | dspln.com/products/custom-grappling-short-black | $55 flat |

Gi total = included parts + add-ons. A part can be removed entirely
("Remove Kimono"), which drops its price and hides its options.

Fabric (customer-facing copy): kimono is 350gsm Pearl Weave; pants are
12oz Cotton Canvas.

## Gi garment colors — the 10-swatch palette

Used for every kimono panel, every pant panel, and belt-text thread
colors, on all three gis. **This palette is fixed — no custom hex on gis.**

White `#ffffff` · Royal Blue `#2a47e8` · Black `#000000` · Olive
`#3a4221` · Khaki `#bfb58a` · Gray `#787878` · Navy `#1a2540` · Red
`#a82828` · Orange `#be5c23` · Brown `#7a4f00`

Colorable panels (default white):
- **Kimono:** Body, Lapel, Reinforcements, Stitching
- **Pant:** Body, Reinforcements, Stitching, Drawcord

## Belt

- **Mens & Womens — Belt Color**, 5 choices: White `#ffffff`, Blue
  `#2a47e8`, Purple `#5b2c83`, Brown `#7a4f00`, Black `#000000`
- **Kids — Belt Rank Color**, 13 two-tone rank choices: White, Gray,
  Gray/White, Gray/Black, Yellow, Yellow/White, Yellow/Black, Orange,
  Orange/White, Orange/Black, Green, Green/White, Green/Black
  (base color with a stripe; serialized as `belt.rank`)

### Belt text (all three gis)

- Left and/or right belt end, **18 characters max** per side, rendered
  UPPERCASE
- **+$10 per side** with text
- Fonts (5): Arial Black, Impact, Helvetica Bold, Georgia Bold,
  Courier Bold
- Thread color: any of the 10 garment swatches (not the 5 belt colors)

## Gi logo slots

| Slot | Mens | Kids | Womens | Price |
|---|---|---|---|---|
| Left chest | ✔ | ✔ | ✔ | +$10 |
| Right chest | ✔ | — | — | +$10 |
| Left sleeve | ✔ | ✔ | ✔ | +$10 |
| Right sleeve | ✔ | ✔ | ✔ | +$10 |
| Big logo on back | ✔ | ✔ | ✔ | +$25 |
| Below-belt back strip | studio-only | — | — | +$25 — placed by DSPLN staff on request |
| Left thigh (pant) | ✔ | ✔ | ✔ | +$10 |
| Right thigh (pant) | ✔ | ✔ | ✔ | +$10 |

Production decoration sizes (official artwork guide): standard areas
~4" wide; the back logo is 10" wide. Logos are auto-fitted keeping
aspect ratio; customers cannot move/scale/rotate gi logos (fixed
production-safe placements). Preview-box dimensions live in
artwork-guide.md.
Text layers on the gi chest exist but are studio-only (+$10 each, staff
placed).

## Gi sizes

- **Mens & Womens kimono/pant:** A00–A6, each in Short/Regular/Long
  (A1S, A1, A1L … 24 options) + "Custom Measurements"
- **Mens & Womens belt:** A00–A6 (no S/L)
- **Kids kimono/pant:** M0, M1, M2, M3, M4 and M0L–M4L (10 options) +
  "Custom Measurements"
- **Kids belt:** M0–M4
- **Custom Measurements: +$25 once per design**, reveals a notes box for
  height/weight/sleeve measurements
- Sizes are per-part — kimono A2 with pants A2L is fine
- Mens & Womens pages include a "Find my size" height/weight recommender
  (note: the womens one currently uses the mens table — treat its output
  with caution) and a link to dspln.com/pages/sizing

## Rashguards & grappling shorts (sublimation products)

Completely different model: full-panel printing, free-form artwork,
**artwork adds no cost**.

- **Colorable panels** — Rashguards: Front Body, Back Body, Left Sleeve,
  Right Sleeve, Neck Band, Stitching. Shorts: Waistband, Right/Left
  Front Leg, Right/Left Back Leg, Stitching.
- **Colors:** 10 standard swatches (White `#ffffff`, Blue `#0033ff`,
  Purple `#4b256f`, Brown `#4a3000`, Black `#2c2c2c`, Khaki `#928f78`,
  Navy `#25375f`, Olive `#4f4622`, Red `#762626`, Orange `#be5c23`)
  **plus a full custom color picker — any hex is allowed** on these
  products (unlike gis).
- **Artwork layers:** unlimited image (PNG/JPG) or text layers, placed on
  any panel zone except stitching. Drag to position, scale 0.2×–4×,
  rotate ±180°, duplicate/hide/lock/reorder. $0.
- **Text layers:** 6 fonts (Arial, Arial Black, Georgia, Impact, Times
  New Roman, Verdana), fill + outline color (any hex), outline width
  0–36.
- **Sizes:** XXS, XS, S, M, L, XL, XXL, XXXL.
- Approximate artwork width at max scale: ~19" on rashguard bodies,
  ~15–20" on short legs, so effectively full-panel graphics are possible.

## Ordering flow facts

- Add to cart requires a size for every included part.
- After ordering, DSPLN sends a 3D model of the design for approval
  before production, then tracking when it ships.
- Cart items carry an Edit button that reopens the configurator with the
  design.

## Known caveats (don't state these as customer facts)

- The upload UI says "max 50 MB" but the effective limit is ~6MB with
  automatic downscaling (see artwork-guide).
- Gi swatch hexes are close approximations of the brand colors, pending
  final confirmation.
- Single-garment configurator pages (kimono-only etc.) exist in code but
  aren't covered by this catalog.
