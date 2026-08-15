/**
 * Derive actual-size pattern outlines from a CLO3D GLB.
 *
 * CLO exports each garment panel with UVs that ARE the flat 2D pattern layout,
 * so the panel's UV silhouette is its cut line. Fabric is near-isometric to its
 * flat pattern, so cm-per-UV-unit = median over triangles of sqrt(area3D/areaUV)
 * — that converts the UV outline to real centimetres without a pattern PDF.
 *
 * A CLO panel is a closed shell (outer + inner surface + edge band), so there
 * are no boundary edges to chain. Instead we rasterise every triangle into a UV
 * mask and trace the outer contour of the largest blob.
 *
 * Output matches rashguard-patterns.json: {widthCm, heightCm, outline:[[x,y]…]}
 * normalised to the bbox and Y-flipped to canvas convention.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

const RASTER = 1400; // long-side resolution of the UV mask

function tri2Area(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
}
function tri3Area(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

/** Ramer–Douglas–Peucker over a closed polygon. */
function simplifyClosed(points, tol) {
  if (points.length < 4) return points;
  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    let t = len > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    let maxD = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
    return [...rdp(pts.slice(0, idx + 1)).slice(0, -1), ...rdp(pts.slice(idx))];
  };
  // Split at the point farthest from points[0] so RDP has two open chains.
  let far = 0, best = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > best) { best = d; far = i; }
  }
  const a = rdp(points.slice(0, far + 1));
  const b = rdp([...points.slice(far), points[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Fill a triangle into a Uint8 mask (scanline, top-left fill). */
function fillTri(mask, W, H, p0, p1, p2) {
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
  const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  if (Math.abs(area) < 1e-12) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((p1[0] - p0[0]) * (py - p0[1]) - (px - p0[0]) * (p1[1] - p0[1])) / area;
      const w1 = ((px - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (py - p0[1])) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -1e-9 && w1 >= -1e-9 && w2 >= -1e-9) mask[y * W + x] = 1;
    }
  }
}

/** Close 1px pin-holes so the contour trace doesn't wander inside. */
function closeMask(mask, W, H) {
  const out = mask.slice();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (mask[y * W + x]) continue;
      const n = mask[(y - 1) * W + x] + mask[(y + 1) * W + x] +
                mask[y * W + x - 1] + mask[y * W + x + 1];
      if (n >= 3) out[y * W + x] = 1;
    }
  }
  return out;
}

/** Largest 4-connected blob. */
function largestBlob(mask, W, H) {
  const label = new Int32Array(W * H).fill(-1);
  let bestId = -1, bestSize = 0, id = 0;
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || label[i] !== -1) continue;
    let size = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % W, y = (p / W) | 0;
      const nbrs = [];
      if (x > 0) nbrs.push(p - 1);
      if (x < W - 1) nbrs.push(p + 1);
      if (y > 0) nbrs.push(p - W);
      if (y < H - 1) nbrs.push(p + W);
      for (const n of nbrs) {
        if (mask[n] && label[n] === -1) { label[n] = id; stack.push(n); }
      }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
    id++;
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (label[i] === bestId) out[i] = 1;
  return { mask: out, size: bestSize };
}

/** Moore-neighbourhood contour trace of a filled blob. */
function traceContour(mask, W, H) {
  let start = -1;
  for (let i = 0; i < W * H; i++) if (mask[i]) { start = i; break; }
  if (start < 0) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 0);
  const sx = start % W, sy = (start / W) | 0;
  const contour = [[sx, sy]];
  let cx = sx, cy = sy, dir = 6; // came from "up"
  for (let guard = 0; guard < W * H * 8; guard++) {
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8; // start scanning from the left of travel
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (at(nx, ny)) {
        cx = nx; cy = ny; dir = d; found = true;
        contour.push([cx, cy]);
        break;
      }
    }
    if (!found) break;
    if (cx === sx && cy === sy) break;
  }
  return contour;
}

export function derivePanel(mesh) {
  const prims = mesh.listPrimitives();
  const uvTris = [];
  const ratios = [];
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  // per-axis scale probes, to confirm the UV is not anisotropic
  let uLen3 = 0, uLenUv = 0, vLen3 = 0, vLenUv = 0;

  for (const prim of prims) {
    const pos = prim.getAttribute('POSITION').getArray();
    const uv = prim.getAttribute('TEXCOORD_0').getArray();
    const indices = prim.getIndices();
    const idx = indices ? indices.getArray() : null;
    const count = idx ? idx.length : pos.length / 3;
    for (let t = 0; t < count; t += 3) {
      const i0 = idx ? idx[t] : t, i1 = idx ? idx[t + 1] : t + 1, i2 = idx ? idx[t + 2] : t + 2;
      const uvs = [i0, i1, i2].map((i) => [uv[i * 2], uv[i * 2 + 1]]);
      const p3 = [i0, i1, i2].map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
      const a2 = tri2Area(...uvs);
      const a3 = tri3Area(...p3);
      if (a2 > 1e-14 && a3 > 1e-14) {
        ratios.push(Math.sqrt(a3 / a2));
        uvTris.push(uvs);
        for (const [u, v] of uvs) {
          if (u < uMin) uMin = u; if (u > uMax) uMax = u;
          if (v < vMin) vMin = v; if (v > vMax) vMax = v;
        }
        // axis-aligned edge probes
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
          const du = Math.abs(uvs[b][0] - uvs[a][0]);
          const dv = Math.abs(uvs[b][1] - uvs[a][1]);
          const d3 = Math.hypot(p3[b][0] - p3[a][0], p3[b][1] - p3[a][1], p3[b][2] - p3[a][2]);
          if (du > 8 * dv && du > 1e-5) { uLen3 += d3; uLenUv += du; }
          if (dv > 8 * du && dv > 1e-5) { vLen3 += d3; vLenUv += dv; }
        }
      }
    }
  }
  if (!uvTris.length) return null;

  ratios.sort((a, b) => a - b);
  const scale = ratios[Math.floor(ratios.length / 2)]; // metres per UV unit
  const uScale = uLenUv > 0 ? uLen3 / uLenUv : scale;
  const vScale = vLenUv > 0 ? vLen3 / vLenUv : scale;

  // rasterise the UV silhouette
  const wUv = uMax - uMin, hUv = vMax - vMin;
  const aspect = wUv / hUv;
  const PAD = 2;
  const W = (aspect >= 1 ? RASTER : Math.max(64, Math.round(RASTER * aspect))) + PAD * 2;
  const H = (aspect >= 1 ? Math.max(64, Math.round(RASTER / aspect)) : RASTER) + PAD * 2;
  const mask = new Uint8Array(W * H);
  const toPx = ([u, v]) => [
    PAD + ((u - uMin) / wUv) * (W - 1 - PAD * 2),
    PAD + ((v - vMin) / hUv) * (H - 1 - PAD * 2),
  ];
  for (const tri of uvTris) fillTri(mask, W, H, ...tri.map(toPx));
  const closed = closeMask(mask, W, H);
  const blob = largestBlob(closed, W, H);
  const contour = traceContour(blob.mask, W, H);
  if (contour.length < 8) return null;

  // Pixels -> normalised UV. NO Y-flip: verified against the shipped
  // adult-grappling-short patterns.json (extracted from its real pattern PDF),
  // un-flipped V scores 98.5% mean IoU vs 73.7% flipped. Flipping here puts the
  // crotch curve at the hem end and prints an upside-down cut line.
  const norm = contour.map(([px, py]) => [
    ((px - PAD) / (W - 1 - PAD * 2)),
    ((py - PAD) / (H - 1 - PAD * 2)),
  ]);
  const outline = simplifyClosed(norm, 0.0035).map(([x, y]) => [
    Number(Math.min(1, Math.max(0, x)).toFixed(5)),
    Number(Math.min(1, Math.max(0, y)).toFixed(5)),
  ]);
  outline.push(outline[0]);

  return {
    widthCm: Number((wUv * scale * 100).toFixed(2)),
    heightCm: Number((hUv * scale * 100).toFixed(2)),
    outline,
    _debug: {
      scale: Number(scale.toFixed(5)),
      anisotropy: Number((uScale / vScale).toFixed(4)),
      fill: Number((blob.size / (W * H)).toFixed(3)),
      contourPts: contour.length,
      simplified: outline.length,
      uv: `U[${uMin.toFixed(3)},${uMax.toFixed(3)}] V[${vMin.toFixed(3)},${vMax.toFixed(3)}]`,
    },
  };
}

export async function loadPanels(path, matcher) {
  const doc = await io.read(path);
  const out = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    if (!matcher(mesh.getName())) continue;
    out.push({ name: mesh.getName(), panel: derivePanel(mesh) });
  }
  return out;
}

// CLI mode only when run directly — this module is also imported by make-patterns.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()) && process.argv[2]) {
  const pattern = new RegExp(process.argv[3] || '.', 'i');
  const panels = await loadPanels(process.argv[2], (n) => pattern.test(n));
  for (const { name, panel } of panels) {
    if (!panel) { console.log(name, 'NO CONTOUR'); continue; }
    const d = panel._debug;
    console.log(
      `${name.padEnd(22)} ${String(panel.widthCm).padStart(6)} x ${String(panel.heightCm).padStart(6)} cm  ` +
      `aniso=${d.anisotropy} fill=${d.fill} pts=${d.contourPts}->${d.simplified} ${d.uv}`,
    );
  }
}
