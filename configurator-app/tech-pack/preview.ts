import { generateTechPack } from './generate-tech-pack';
import { buildFixture } from './fixtures';

const status = document.getElementById('status')!;
const frame = document.getElementById('preview') as HTMLIFrameElement;

function render() {
  status.textContent = 'Generating…';
  try {
    const pdf = generateTechPack(buildFixture());
    // Show inline so iteration is instant (no download dialog each time).
    frame.src = pdf.output('datauristring');
    status.textContent = 'Done. Edit fixtures.ts / generate-tech-pack.ts and click again.';
  } catch (err) {
    status.textContent = 'Error: ' + (err as Error).message;
    console.error(err);
  }
}

function download() {
  const pdf = generateTechPack(buildFixture());
  pdf.save('dspln-techpack-1061.pdf');
}

document.getElementById('generate')!.addEventListener('click', render);
document.getElementById('download')!.addEventListener('click', download);

// Render once on load.
render();
