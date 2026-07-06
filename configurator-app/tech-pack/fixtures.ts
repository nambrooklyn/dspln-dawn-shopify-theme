import {
  fromDesignRecord,
  type DesignRecord,
  type TechPackData,
} from './tech-pack-data';

// Self-contained sample that mirrors the REAL data path:
//   design record (as returned by /api/customer-designs)  ->  fromDesignRecord()  ->  TechPackData
// No binary assets — placeholder images are generated in code. Real renders and
// logo art swap in unchanged at integration time.

/** Draw a labelled placeholder image and return it as a PNG data URL. */
function placeholderRender(label: string, bg = '#1a1a1a'): string {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 780;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
  ctx.fillStyle = '#888';
  ctx.font = 'bold 42px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, c.width / 2, c.height / 2);
  ctx.font = '20px Helvetica, Arial, sans-serif';
  ctx.fillText('(render placeholder)', c.width / 2, c.height / 2 + 36);
  return c.toDataURL('image/png');
}

/** A tiny colored badge to stand in for uploaded logo art. */
function placeholderLogo(text: string, color = '#c0392b'): string {
  const c = document.createElement('canvas');
  c.width = 120;
  c.height = 120;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color;
  ctx.font = 'bold 48px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2);
  return c.toDataURL('image/png');
}

/** A saved-design record shaped like /api/customer-designs returns. */
function sampleRecord(): DesignRecord {
  return {
    configData: {
      spec: {
        kimono: {
          size: 'A5S',
          colors: {
            body: { hex: '#8b1a1a', name: 'Red' },
            lapel: { hex: '#3b5bdb', name: 'Royal Blue' },
            reinforcement: { hex: '#3b5bdb', name: 'Royal Blue' },
            stitching: { hex: '#3b5bdb', name: 'Royal Blue' },
          },
        },
        belt: {
          size: 'A4',
          color: { hex: '#5b3b9b', name: 'Purple' },
          embroidery: { leftEnd: '', rightEnd: '' },
        },
        pant: {
          size: 'A5S',
          colors: {
            body: { hex: '#1e2a55', name: 'Navy' },
            reinforcement: { hex: '#3b5bdb', name: 'Royal Blue' },
            stitching: { hex: '#3b5bdb', name: 'Royal Blue' },
            drawcord: { hex: '#6b4423', name: 'Brown' },
          },
        },
      },
      images: {
        kimono: {
          'left-chest': { dataUrl: placeholderLogo('SyQ', '#222'), filename: 'syq.png' },
          'left-sleeve': { dataUrl: placeholderLogo('SyQ', '#222'), filename: 'syq.png' },
          'right-sleeve': { dataUrl: placeholderLogo('SyQ', '#222'), filename: 'syq.png' },
          back: { dataUrl: placeholderLogo('BFW'), filename: 'bfw.png' },
        },
        pant: {
          'left-pant': { dataUrl: placeholderLogo('L', '#2e7d32'), filename: 'left.png' },
          'right-pant': { dataUrl: placeholderLogo('R', '#1565c0'), filename: 'right.png' },
        },
      },
    },
    thumbnailUrl: placeholderRender('FRONT'),
  };
}

export function buildFixture(): TechPackData {
  // Mirror production: feed a design record + order number through the adapter.
  // The webhook will supply real snapshot URLs here; the preview supplies 4
  // distinct placeholders so every render slot is visible.
  return fromDesignRecord(sampleRecord(), '1061', {
    front: placeholderRender('FRONT'),
    back: placeholderRender('BACK'),
    left: placeholderRender('LEFT'),
    right: placeholderRender('RIGHT'),
  });
}
