/**
 * Prep the CLO3D "Kids Baseball Short" export for the configurator.
 *
 * CLO named the four fabric panels after internal lines ("Internal Line_44927"),
 * and split each into 3 primitives that SHARE the same POSITION/NORMAL/UV
 * accessors (outer surface / inner surface / edge band — only the index buffers
 * differ). So:
 *   1. merge the 3 primitives per panel into one (concat indices, no vertex work)
 *   2. rename each panel from its centroid: lower X = wearer's right,
 *      higher Z = front  (matches the shipped adult-grappling-short convention)
 *   3. Draco-compress
 *
 * Panel names must be human-readable because RASHGUARD_MESH_TO_PART keys off
 * them, and CLO's internal-line IDs change on every re-export.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const IN = process.argv[2];
const OUT = process.argv[3];
const PANEL_RE = /internal line/i;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const doc = await io.read(IN);
const root = doc.getRoot();

// --- report node transforms (a stray rotation/scale would break framing) -----
for (const node of root.listNodes()) {
  const t = node.getTranslation(), r = node.getRotation(), s = node.getScale();
  const moved = t.some((v) => v !== 0) || r[3] !== 1 || s.some((v) => v !== 1);
  if (moved) console.log('NODE TRANSFORM', node.getName(), { t, r, s });
}

// --- collect panels + centroids ---------------------------------------------
const panels = [];
for (const mesh of root.listMeshes()) {
  if (!PANEL_RE.test(mesh.getName())) continue;
  const prim = mesh.listPrimitives()[0];
  const pos = prim.getAttribute('POSITION');
  const min = pos.getMin([]), max = pos.getMax([]);
  panels.push({
    mesh,
    cx: (min[0] + max[0]) / 2,
    cz: (min[2] + max[2]) / 2,
    cy: (min[1] + max[1]) / 2,
  });
}
if (panels.length !== 4) {
  throw new Error(`expected 4 fabric panels, found ${panels.length}`);
}

const centerX = panels.reduce((a, p) => a + p.cx, 0) / panels.length;
const centerZ = panels.reduce((a, p) => a + p.cz, 0) / panels.length;

for (const p of panels) {
  const side = p.cx < centerX ? 'Right' : 'Left'; // lower X = wearer's right
  const face = p.cz > centerZ ? 'Front' : 'Back'; // higher Z = front
  p.newName = `${side} ${face} Leg`;
}

const names = new Set(panels.map((p) => p.newName));
if (names.size !== 4) {
  throw new Error(`panel naming collided: ${[...names].join(', ')}`);
}

// --- merge primitives + rename ----------------------------------------------
for (const p of panels) {
  const prims = p.mesh.listPrimitives();
  const base = prims[0];

  // Every primitive must share attributes for a pure index concat to be valid.
  for (const other of prims.slice(1)) {
    for (const sem of base.listSemantics()) {
      if (other.getAttribute(sem) !== base.getAttribute(sem)) {
        throw new Error(`${p.mesh.getName()}: ${sem} accessor not shared — cannot merge by index concat`);
      }
    }
    if (other.getMaterial() !== base.getMaterial()) {
      throw new Error(`${p.mesh.getName()}: primitives use different materials`);
    }
  }

  const merged = [];
  for (const prim of prims) merged.push(...prim.getIndices().getArray());

  const vertexCount = base.getAttribute('POSITION').getCount();
  const Ctor = vertexCount > 65535 ? Uint32Array : Uint16Array;
  const acc = doc.createAccessor()
    .setType('SCALAR')
    .setArray(new Ctor(merged))
    .setBuffer(root.listBuffers()[0]);

  const oldIndices = prims.map((prim) => prim.getIndices());
  base.setIndices(acc);
  for (const prim of prims.slice(1)) {
    p.mesh.removePrimitive(prim);
    prim.dispose();
  }
  for (const a of oldIndices) if (a.listParents().length <= 1) a.dispose();

  const old = p.mesh.getName();
  p.mesh.setName(p.newName);
  for (const node of root.listNodes()) {
    if (node.getMesh() === p.mesh) node.setName(p.newName);
  }
  console.log(
    `panel: ${old.padEnd(22)} -> ${p.newName.padEnd(17)} ` +
    `centroid x=${p.cx.toFixed(3)} z=${p.cz.toFixed(3)}  tris=${merged.length / 3}`,
  );
}

// --- fix mirrored UVs -------------------------------------------------------
// CLO exported this model's two BACK panels with their UVs mirrored (the piece
// as seen from the inside). Artwork is composited in UV space and the art-file
// cut outline is derived from UV, so a mirrored panel renders reversed text on
// the model AND prints a reversed pattern piece. Detect it from the data rather
// than hardcoding: for outward-facing triangles the UV winding must be CW —
// that is what the shipped adult-grappling-short has on all four panels, and
// what this model's (correctly-rendering) front panels have.
function outerFaceUvWinding(mesh, centreZ) {
  let cw = 0, ccw = 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray();
    const uv = prim.getAttribute('TEXCOORD_0').getArray();
    const idx = prim.getIndices().getArray();
    for (let t = 0; t < idx.length; t += 3) {
      const [i0, i1, i2] = [idx[t], idx[t + 1], idx[t + 2]];
      const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      const [a, b, c] = [P(i0), P(i1), P(i2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normalZ = u[0] * v[1] - u[1] * v[0]; // z of the face normal u × v
      const ctrZ = (a[2] + b[2] + c[2]) / 3;
      if (Math.abs(normalZ) < 1e-12) continue;
      if ((ctrZ - centreZ) * normalZ <= 0) continue; // inner surface
      const U = (i) => [uv[i * 2], uv[i * 2 + 1]];
      const [ua, ub, uc] = [U(i0), U(i1), U(i2)];
      const cross =
        (ub[0] - ua[0]) * (uc[1] - ua[1]) - (uc[0] - ua[0]) * (ub[1] - ua[1]);
      if (cross > 0) ccw++;
      else if (cross < 0) cw++;
    }
  }
  return { cw, ccw };
}

const flippedAccessors = new Set();
for (const p of panels) {
  const { cw, ccw } = outerFaceUvWinding(p.mesh, centerZ);
  if (ccw <= cw) {
    console.log(`uv: ${p.newName.padEnd(17)} winding CW — ok`);
    continue;
  }
  // Mirror U inside the panel's own UV tile (V untouched).
  for (const prim of p.mesh.listPrimitives()) {
    const acc = prim.getAttribute('TEXCOORD_0');
    if (flippedAccessors.has(acc)) continue;
    flippedAccessors.add(acc);
    const arr = acc.getArray();
    let uMin = Infinity, uMax = -Infinity;
    for (let i = 0; i < arr.length; i += 2) {
      if (arr[i] < uMin) uMin = arr[i];
      if (arr[i] > uMax) uMax = arr[i];
    }
    const sum = uMin + uMax;
    for (let i = 0; i < arr.length; i += 2) arr[i] = sum - arr[i];
    acc.setArray(arr);
  }
  console.log(
    `uv: ${p.newName.padEnd(17)} winding CCW — MIRRORED, flipped U (${ccw} vs ${cw})`,
  );
}

// --- sanity: every remaining mesh is either a named panel or stitching -------
for (const mesh of root.listMeshes()) {
  const n = mesh.getName();
  if (names.has(n)) continue;
  if (/stitch/i.test(n)) continue;
  console.log('UNMAPPED MESH (will not colour):', n);
}

// --- Draco ------------------------------------------------------------------
doc.createExtension(KHRDracoMeshCompression)
  .setRequired(true)
  .setEncoderOptions({
    method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    encodeSpeed: 5,
    decodeSpeed: 5,
    quantizationBits: { POSITION: 16, TEXCOORD_0: 16, NORMAL: 12 },
  });

await io.write(OUT, doc);
console.log('\nwrote', OUT);
