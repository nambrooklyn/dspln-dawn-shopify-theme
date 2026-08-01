# Artwork Guide — requirements, analysis, and fixes

Everything here is extracted from the shipped configurator code. When you
state a requirement to a customer, these are the real numbers.

## File requirements (what the configurator actually accepts)

| Rule | Value | Notes |
|---|---|---|
| Formats | **PNG or JPEG only** | The upload UI silently ignores every other type — no error is shown. SVG/PDF/AI are not supported anywhere. Convert before uploading. |
| Practical size ceiling | ~**6MB** of encoded bytes at the backend | The UI label says "max 50 MB" but nothing enforces it client-side; the backend rejects over ~6MB. |
| Auto-shrink | The configurator downscales oversized uploads automatically | Targets ≤2.5MB binary and clamps the long side to 3000px (print ceiling: the largest placement at 300 DPI). Images with transparency stay PNG; fully opaque images are re-encoded as JPEG. Long side never shrinks below 512px. |
| Transparency | PNG alpha is fully supported and preserved | Transparent padding is auto-trimmed on upload (PNG only), so the visible artwork fills its print box. |
| Resolution guidance | 800px+ long side minimum, 1500px+ ideal, 3000px covers every placement at print quality | Not enforced by code — this is quality advice. A 300px logo prints blurry at 4 inches. |

Customer-facing summary you can give verbatim: *"PNG or JPG. Transparent
PNG is best for logos. Aim for at least 1500px on the long side; anything
bigger than ~3000px or ~6MB gets automatically scaled down."*

## Placement sizes (gi configurators)

Two different numbers exist — don't mix them up:

- **Production size (what actually goes on the garment, per DSPLN's
  official artwork guide at dspln.com/pages/artwork):** standard logo
  areas are decorated at about **4 inches wide**; the **back of the
  kimono is 10 inches wide**. Artwork should ideally be supplied at
  those physical sizes or larger (at 300 DPI: ~1200px for 4", ~3000px
  for 10").
- **On-screen preview box (3D model units):** each slot aspect-fits the
  logo into a fixed box — chest/sleeves/thighs 1.95×1.95 (womens left
  chest 1.755), back 3.7×3.7, mens back-skirt strip 4.2×1.6. These
  control how the preview looks, not the final decoration size.

Slots and prices: left chest +$10 (all gis), right chest +$10 (mens
only), left/right sleeve +$10 each, big back logo +$25, left/right
thigh +$10 each, mens below-belt back strip +$25 (**studio-only** —
placed by DSPLN staff on request).

Customers cannot move, scale, or rotate gi logos — fixed placements keep
the print production-safe.

Aspect-ratio consequence worth telling customers: a very wide logo in a
square preview box renders small (a 4:1 banner in a square chest box
shows ~¼ as tall as wide). Square-ish logos work everywhere; very wide
marks suit the back or the mens back-skirt strip.

## Production rules (embroidery — from DSPLN's official artwork guide)

These are the shop's stated production standards; repeat them to
customers asking about quality:

- Every file is **personally reviewed and edited by DSPLN** before
  production, and the customer approves the edited version first — so
  imperfect files aren't fatal, they just add a review round.
- Small text: keep at least **0.25" tall** (~36pt) and lines at least
  **0.05" thick** (satin-stitch minimum; thinner becomes run stitch).
  Simple fonts (Arial/Helvetica-like) embroider best.
- Large filled areas — especially the big back logo — are done as
  **fabric applique** (fabric stitched down and edged with embroidery);
  small elements are direct thread embroidery.
- **Photographic images cannot be embroidered**; neon and metallic
  colors don't reproduce well in thread.
- Thread colors are matched to standard threads; customers with an
  exact shade should provide a **Pantone number**.
- Official guide copy states preferred format PNG (JPEG/GIF/TIFF
  accepted at 300 DPI) and a 4MB size guideline — the configurator
  technically accepts up to ~6MB and auto-shrinks, so treat 4MB as the
  advice you give, not a hard wall.

Rashguards and grappling shorts use free-form artwork layers instead of
slots — artwork can be placed, scaled (0.2×–4×), rotated, and layered on
any panel zone at no extra charge. See the product catalog for zones.

## Analysis workflow

1. Run the measurable checks first:
   ```bash
   python scripts/inspect_artwork.py <file> --json
   ```
2. Look at the image yourself for what the script can't judge:
   - Thin lines and small text (fill in when embroidered, fuzz out when
     printed small)
   - Whether a background removal would eat parts of the subject
     (white background + white text = disaster)
   - Gradient/photo content destined for embroidery
   - Whether the crop is off-center or skewed
3. Report findings in plain language, worst problem first, each with the
   fix you propose.

## Decision rules

- **Solid background + garment placement** → offer background removal.
  A white box around a logo on a navy gi is the most common customer
  mistake. Exception: the customer wants the box (framed patch look).
- **Low resolution** (long side <800px) → warn, state the printed effect
  ("will look soft at chest size"), offer: smaller placement, a better
  source file, or proceed-as-is. Don't upscale and call it fixed —
  upscaling can't invent detail.
- **JPEG logo** → convert to PNG only if transparency is needed; JPEG is
  fine for full-bleed photographic prints on rashguard panels.
- **Gradient or photo, embroidery intent** → explain gradients must
  become solid thread colors; offer print instead, or simplification.
- **Wide/tall aspect vs chosen slot** → point at the print-box math above
  and suggest the better slot.
- **Over ~6MB** → the configurator will auto-shrink it anyway; offer to
  pre-optimize with `fix_artwork.py shrink` so the customer controls the
  quality instead of the auto-shrinker.
- **Can't fix reliably** (complex background, tiny crest, corrupt file) →
  escalate per SKILL.md; never ship a maybe.

## Fix commands

```bash
python scripts/fix_artwork.py remove-bg input.jpg output.png   # solid bg → transparent
python scripts/fix_artwork.py trim input.png output.png        # crop transparent padding
python scripts/fix_artwork.py shrink input.png output.png      # fit under upload limit
python scripts/fix_artwork.py to-png input.webp output.png     # format conversion
```

Always write to a new file; the original upload is never modified. After
any fix, re-run `inspect_artwork.py` on the output and show the customer
before/after facts (dimensions, transparency, size).

`remove-bg` only handles uniform backgrounds (it refuses when the corners
disagree) — that refusal is your signal for manual masking or escalation,
not for forcing it.
