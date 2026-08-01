#!/usr/bin/env python3
"""Inspect a customer artwork file for DSPLN print/embroidery readiness.

Usage: python inspect_artwork.py <image-path> [--json]

Reports the measurable half of the artwork checklist (format, dimensions,
transparency, background, color complexity, file size vs upload limits) and
flags production risks. Judgment calls (thin lines, small text, gradients
for embroidery) still need the agent to look at the image itself.
"""

import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

UPLOAD_LIMIT_BYTES = 6_000_000  # backend hard limit on upload-artwork
AUTO_SHRINK_TARGET = 5_200_000  # client auto-shrinks anything above this
RECOMMENDED_MIN_PX = 800        # comfortable minimum long side for a 4" print
GOOD_MIN_PX = 1500              # ideal long side


def solid_background(img):
    """Sample the four corners; if they match and are opaque, the file most
    likely has a solid background that should be removed for garment print."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    corners = [rgba.getpixel(p) for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]]
    if any(c[3] < 250 for c in corners):
        return None  # transparent corners: background already removed
    first = corners[0][:3]
    if all(sum(abs(a - b) for a, b in zip(c[:3], first)) < 30 for c in corners):
        return "#%02x%02x%02x" % first
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    as_json = "--json" in sys.argv
    if not args:
        sys.exit(__doc__)
    path = Path(args[0])
    if not path.exists():
        sys.exit(f"File not found: {path}")

    size_bytes = path.stat().st_size
    img = Image.open(path)
    img.load()
    w, h = img.size
    has_alpha = img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info
    alpha_used = False
    if has_alpha:
        alpha = img.convert("RGBA").getchannel("A")
        lo, hi = alpha.getextrema()
        alpha_used = lo < 250

    quantized = img.convert("RGB").quantize(colors=64)
    color_count = len([c for c in (quantized.getcolors(64) or []) if c[0] > (w * h) * 0.001])
    bg = solid_background(img)

    findings = []
    if img.format not in ("PNG", "JPEG", "WEBP"):
        findings.append(f"RISK: {img.format} is not an accepted upload format (use PNG or JPG)")
    if size_bytes > UPLOAD_LIMIT_BYTES:
        findings.append(
            f"NOTE: {size_bytes/1e6:.1f}MB exceeds the 6MB upload limit — the configurator "
            "auto-shrinks it on save, which reduces resolution; pre-optimizing keeps quality")
    if max(w, h) < RECOMMENDED_MIN_PX:
        findings.append(
            f"RISK: longest side {max(w, h)}px is low for garment printing "
            f"({RECOMMENDED_MIN_PX}px minimum recommended, {GOOD_MIN_PX}px+ ideal)")
    if img.format == "JPEG":
        findings.append(
            "NOTE: JPEG has no transparency — the logo prints inside a solid rectangle; "
            "convert to transparent PNG unless a filled background is intended")
    if bg:
        findings.append(
            f"RISK: solid background detected ({bg}) — will print as a colored box on the "
            "garment; offer background removal")
    if has_alpha and not alpha_used:
        findings.append("NOTE: file has an alpha channel but it is fully opaque")
    if color_count >= 40:
        findings.append(
            "NOTE: high color/gradient complexity — fine for print, unsuitable for embroidery "
            "without simplification to solid thread colors")

    report = {
        "file": str(path),
        "format": img.format,
        "dimensions": f"{w}x{h}",
        "long_side_px": max(w, h),
        "megabytes": round(size_bytes / 1e6, 2),
        "transparent_background": bool(alpha_used),
        "solid_background_hex": bg,
        "approx_color_count_capped_64": color_count,
        "within_upload_limit": size_bytes <= UPLOAD_LIMIT_BYTES,
        "findings": findings or ["No measurable issues found"],
    }
    if as_json:
        print(json.dumps(report, indent=2))
    else:
        for k, v in report.items():
            if k == "findings":
                print("findings:")
                for f in v:
                    print(f"  - {f}")
            else:
                print(f"{k}: {v}")


if __name__ == "__main__":
    main()
