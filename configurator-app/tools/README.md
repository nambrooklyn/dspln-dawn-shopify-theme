# CLO3D asset pipeline (kids-baseball-short and friends)

Turns a raw CLO3D GLB export into (a) a configurator-ready model and (b) the
actual-size `rashguard-patterns.json` cut outlines for the tech pack — **without
needing a pattern PDF**, because CLO's UV layout *is* the flat pattern.

These are dev-time scripts. They are deliberately **not** in `package.json` —
their deps would otherwise ship to the Netlify build. Install them ad hoc:

```bash
npm i --no-save @gltf-transform/core @gltf-transform/extensions draco3dgltf
```

## One command does everything

```bash
node tools/prep-clo-glb.mjs "~/path/Kids Baseball Short.glb" \
  public/models/kids-baseball-short.glb \
  src/components/configurators/kids-baseball-short/rashguard-patterns.json
```

Prepping the model and deriving the patterns **must** happen in one pass, in
this order, and the script enforces it:

1. rename panels → 2. fix mirrored UVs → 3. **derive patterns** → 4. merge
   primitives → 5. Draco

Derive before the mirrored-UV fix and the back pieces print mirrored. Derive
after the merge and the edge band is fused into the surface, which puts small
tabs back on the cut line (see below). Both mistakes have been shipped once.

Does five things, all reported to stdout so you can eyeball them:

- **Merges primitives.** CLO splits each panel into 3 primitives (outer surface /
  inner surface / edge band) that share the same POSITION/NORMAL/UV accessors —
  only the index buffers differ. They merge by concatenating indices; no vertex
  work, no geometry risk.
- **Renames panels from geometry.** CLO named them after internal lines
  (`Internal Line_44927`), and those IDs change on every re-export. The script
  derives `Right/Left Front/Back Leg` from centroids: **lower X = wearer's right,
  higher Z = front** (the convention the shipped adult-grappling-short uses).
  *Better fix: name the pattern pieces in CLO before exporting.*
- **Fixes mirrored UVs.** This export had its two BACK panels' UVs mirrored (the
  piece as seen from the inside). Artwork is composited in UV space and the cut
  outline is derived from UV, so a mirrored panel renders reversed text on the
  model **and** prints a reversed pattern piece. The rule, verified against the
  shipped adult-grappling-short (all four panels) and this model's correct front
  panels: for outward-facing triangles, UV winding must be **CW**. Anything CCW
  gets its U mirrored inside its own UV tile.
- **Draco-compresses.** 10 MB → 2.0 MB here.

Check the winding of any model separately with:

```bash
node tools/check-uv-winding.mjs public/models/kids-baseball-short.glb "leg"
```

## How the patterns are derived

Rasterises each panel's UV silhouette and traces its contour (a CLO panel is a
closed shell, so there are no boundary edges to chain), then converts UV units to
centimetres via the median per-triangle `sqrt(area3D / areaUV)` — fabric is
near-isometric to its flat pattern.

**Surface primitive only.** CLO splits each panel into outer surface / inner
surface / edge-thickness band. The band's UV island pokes 1–2 mm past the
surface island at the piece ends, and rasterising it stamped small rectangular
tabs onto the printed cut line — they looked like stray quarter-inch extensions
and were mistaken for seam allowance. They are the panel's *thickness*. Only the
largest primitive (the surface) is used; outer and inner share a UV island so
either gives the same silhouette.

**These outlines are the sewn (net) line — no seam allowance, no notches, no
grainline.** CLO's 3D surface is the finished panel, so allowance never appears
in the mesh regardless of the CLO setting. If the factory needs allowance on the
cut file, it has to come from a real pattern export (DXF/AAMA or a 1:1 PDF), not
from here.

**Accuracy, measured.** Run against the adult-grappling-short, whose
`rashguard-patterns.json` came from its real pattern PDF, this reproduces every
leg panel to within ~1% (33.06 × 43.24 vs 32.93 × 42.87 cm) at **98.5% mean
outline IoU**. Elastic pieces are the exception: its waistband came out ~8% large
because elastic is stretched in 3D, breaking the isometry assumption. So: trust
this for woven/knit panels, and prefer a real pattern PDF for elastic ones.

**Orientation.** Outlines are normalised to the bbox with **no Y-flip** — verified
by IoU against the shipped file (un-flipped 98.5% vs flipped 73.7%). Flipping puts
the crotch curve at the hem end and prints an upside-down cut line.
