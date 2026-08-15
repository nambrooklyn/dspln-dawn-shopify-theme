import { loadPanels } from './derive-patterns.mjs';
const KEY = {
  'Right Front Leg': 'rightFrontLeg',
  'Right Back Leg': 'rightBackLeg',
  'Left Front Leg': 'leftFrontLeg',
  'Left Back Leg': 'leftBackLeg',
};
const panels = await loadPanels(process.argv[2], (n) => n in KEY);
const out = {};
// Same key order as RASHGUARD_PARTS so the tech pack pages read front-to-back.
for (const key of ['rightFrontLeg','rightBackLeg','leftFrontLeg','leftBackLeg']) {
  const hit = panels.find(p => KEY[p.name] === key);
  if (!hit || !hit.panel) throw new Error('missing panel for ' + key);
  const { widthCm, heightCm, outline, _debug } = hit.panel;
  console.error(`${key.padEnd(14)} ${widthCm} x ${heightCm} cm  pts=${outline.length} aniso=${_debug.anisotropy}`);
  out[key] = { widthCm, heightCm, outline };
}
process.stdout.write(JSON.stringify(out));
