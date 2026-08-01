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

## Print sizes per placement (gi configurators)

Logos are auto-fitted inside a fixed print box per slot, keeping aspect
ratio — customers do not free-position gi logos (mens; kids/womens add
nudge/scale/rotate controls on each slot):

| Slot | Print box | Add-on price |
|---|---|---|
| Left chest / Right chest | 1.95" × 1.95" | +$10 each |
| Left sleeve / Right sleeve | 1.95" × 1.95" | +$10 each |
| Big logo on back | 3.7" × 3.7" | +$25 |
| Logo below belt, back skirt | 4.2" × 1.6" (wide strip) | +$25 — **studio-only**: staff place it on request; customers can't add it themselves |
| Left thigh / Right thigh (pants) | 1.95" × 1.95" | +$10 each |

Aspect-ratio consequence worth telling customers: a very wide logo in a
square box prints small (a 4:1 banner in the 1.95" chest box prints only
~0.5" tall). Wide logos look best on the back-skirt strip; square-ish
logos work everywhere.

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
