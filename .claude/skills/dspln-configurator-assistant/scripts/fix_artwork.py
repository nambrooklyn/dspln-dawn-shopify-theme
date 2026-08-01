#!/usr/bin/env python3
"""Common artwork fixes for DSPLN logo uploads.

Usage:
  python fix_artwork.py remove-bg <in> <out.png> [--tolerance 30]
      Remove a solid background (sampled from the corners) to transparency.
      Refuses when corners disagree — that needs human/agent judgment.
  python fix_artwork.py trim <in> <out.png>
      Crop away fully-transparent padding so the logo fills its print box.
  python fix_artwork.py shrink <in> <out> [--max-bytes 5200000]
      Downscale until the encoded file fits the upload limit
      (PNG stays PNG to keep transparency; JPEG stays JPEG).
  python fix_artwork.py to-png <in> <out.png>
      Convert any accepted raster format to PNG.

Always write to a NEW file — never overwrite the customer's original.
"""

import io
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")


def opt(name, default):
    if name in sys.argv:
        return type(default)(sys.argv[sys.argv.index(name) + 1])
    return default


def remove_bg(src, dst, tolerance):
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    corners = [img.getpixel(p)[:3] for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]]
    base = corners[0]
    if any(sum(abs(a - b) for a, b in zip(c, base)) > tolerance * 2 for c in corners):
        sys.exit("Corners are not a uniform color — background removal here needs manual "
                 "masking, not flood keying. Escalate or inspect visually.")
    data = [
        (r, g, b, 0) if sum(abs(x - y) for x, y in zip((r, g, b), base)) <= tolerance else px
        for px in img.getdata()
        for (r, g, b, _) in [px]
    ]
    img.putdata(data)
    img.save(dst, "PNG")
    print(f"Removed {('#%02x%02x%02x' % base)} background -> {dst}")


def trim(src, dst):
    img = Image.open(src).convert("RGBA")
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        sys.exit("Image is fully transparent — nothing to trim.")
    img.crop(bbox).save(dst, "PNG")
    print(f"Trimmed to content {bbox} -> {dst}")


def shrink(src, dst, max_bytes):
    img = Image.open(src)
    fmt = "PNG" if (img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info) else "JPEG"
    scale = 1.0
    for _ in range(12):
        out = img if scale == 1.0 else img.resize(
            (max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.LANCZOS)
        buf = io.BytesIO()
        (out.convert("RGBA") if fmt == "PNG" else out.convert("RGB")).save(
            buf, fmt, **({"quality": 85} if fmt == "JPEG" else {"optimize": True}))
        if buf.tell() <= max_bytes or min(out.size) <= 512:
            Path(dst).write_bytes(buf.getvalue())
            print(f"{buf.tell()/1e6:.2f}MB at {out.width}x{out.height} ({fmt}) -> {dst}")
            return
        scale *= 0.8
    sys.exit("Could not shrink under the limit without destroying the image.")


def to_png(src, dst):
    Image.open(src).save(dst, "PNG")
    print(f"Converted to PNG -> {dst}")


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    cmd, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    if Path(src).resolve() == Path(dst).resolve():
        sys.exit("Refusing to overwrite the original file — write to a new path.")
    if cmd == "remove-bg":
        remove_bg(src, dst, opt("--tolerance", 30))
    elif cmd == "trim":
        trim(src, dst)
    elif cmd == "shrink":
        shrink(src, dst, opt("--max-bytes", 5_200_000))
    elif cmd == "to-png":
        to_png(src, dst)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
