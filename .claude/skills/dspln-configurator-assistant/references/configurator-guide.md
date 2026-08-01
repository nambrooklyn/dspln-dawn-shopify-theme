# Configurator Guide — how customers use it

The configurator lives on each custom product page on dspln.com (it's an
embedded 3D app; the customer just sees the product page). Product URLs
are in `product-catalog.md`.

## Gi configurators (mens / womens / kids)

### Desktop layout

- **Left panel** — customization sections with tabs for **Kimono / Belt
  / Pant**. Each tab holds that part's size picker, color rows, and logo
  upload boxes (each labeled with its placement and add-on price, e.g.
  "LOGO ON LEFT SLEEVE +$10").
- **Center** — the 3D gi. Drag to rotate, scroll/pinch to zoom. Selecting
  a section moves the camera to the relevant angle automatically.
- **Under the model** — KIMONO / BELT / PANT toggle pills: clicking one
  removes/adds that part from the order (and the price).
- **Right panel** — live price summary: each included part with its
  price, then the total. **ADD TO CART** button at the bottom.
- **Left edge rail** — Uploads (re-use previously uploaded logos) and
  Guide (opens the how-to page, dspln.com/pages/how-to-use-customizer).

### Mobile

Same capabilities in a vertical flow: the 3D model on top (rotate with
one finger horizontally; the page scrolls vertically), customization
steps below, then price and ADD TO CART. Fully usable — checkout works on
mobile.

### Steps to design a gi (tell customers in this order)

1. Pick which parts you want — kimono, belt, pants, or any combination
   (toggle pills under the model).
2. Pick a size for each included part (sizes are per-part, so a kimono
   can be A2 while pants are A2L).
3. Choose colors per part — kimono: body, lapel, reinforcements,
   stitching; pants: body, reinforcements, stitching, drawcord; belt:
   one color.
4. Add logos: click a logo box, upload PNG/JPG. The logo lands in that
   fixed placement automatically, sized to fit its print box — there are
   no move/scale controls on gi logos (fixed placements keep the print
   production-safe).
5. Belt text: type text for either belt end, pick a font and thread
   color (+$10 per end).
6. Review the price panel and ADD TO CART.

After ordering, DSPLN sends a 3D model of the exact gi for approval
before production begins, with tracking to follow — customers can ask
questions at that stage too.

### Loading a shared design

Opening a link like `dspln.com/products/customgi?design=<id>` loads that
saved design into the configurator, ready to adjust and buy. Nothing to
click — it just appears.

### Cart editing

In the cart, each custom item has an **Edit** button that reopens the
configurator with that item's design; saving updates the cart line.
**Remove** deletes the line.

## Rashguards and grappling shorts

Different model: instead of fixed logo slots, these are **full-panel
sublimation** products — every panel is printable.

- **Two tabs: Garment / Artwork.**
- **Garment** — size (XXS–XXXL) and per-panel colors. Rashguards: front
  body, back body, left/right sleeve, neck band, stitching. Shorts:
  waistband, four leg panels, stitching. Ten standard swatches **plus a
  full custom color picker** — any color is allowed on these products
  (unlike the gi's fixed palette).
- **Artwork** — free-form layers: upload images (PNG/JPG) or add text
  (6 fonts, fill + outline color, outline width). Each layer can be
  dragged on the model, scaled 0.2×–4×, rotated ±180°, duplicated,
  hidden, reordered, or locked. Choose the target zone (front/back/
  sleeves/neck band; or waistband/legs on shorts) from the layer's
  dropdown. Artwork adds no cost on these products.
- Front/Back view toggle under the model; Ctrl/Cmd+Z undoes.

## Things customers commonly miss

- Logo boxes show the add-on price on the label; the total updates live
  in the price panel.
- A part toggled off (e.g. no belt) drops its options *and* its price.
- Add to cart requires a size for every included part — the error toast
  names the missing one.
- On the gi, logo placement is fixed per slot (that's what makes it
  production-safe); on rashguards/shorts placement is free.
- The back-skirt ("below the belt") logo strip is placed by DSPLN staff
  on request — customers who ask for it should contact support or ask
  you to build the design for them.

## Sizing questions

Point customers to the size recommender directly below the configurator
on the product page (height/weight → suggested size) and the sizing
guide at dspln.com/pages/sizing. Detailed sizing advice is coming as a
dedicated agent; don't improvise size recommendations beyond those tools.
