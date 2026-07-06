// The view model the tech-pack generator renders from, plus the adapter that
// builds it from the configurator's real saved-design record.
//
// Data source (production): a Shopify order line item carries the hidden
// property `_dspln_design_id`. The webhook fetches the full design via
// GET /api/customer-designs?id={id} (netlify/functions/customer-designs.mjs)
// and passes the returned record here. No configurator UI is scraped.

export interface TechPackColor {
  name: string; // display name, e.g. "ROYAL BLUE"
  hex: string; // jsPDF-compatible, e.g. "#3B5BDB"
}

export interface TechPackLogo {
  dataUrl: string; // logo art as a PNG/JPEG data URL (drawn as a thumbnail)
  caption?: string; // usually the filename
}

export type TechPackLogoSlot = TechPackLogo | null;

export interface TechPackData {
  orderNumber: string;
  renders: { front: string; back: string; left: string; right: string };
  kimono: {
    size: string;
    body: TechPackColor;
    lapel: TechPackColor;
    reinforcement: TechPackColor;
    stitching: TechPackColor;
    logos: {
      leftChest: TechPackLogoSlot;
      leftSleeve: TechPackLogoSlot;
      rightSleeve: TechPackLogoSlot;
      back: TechPackLogoSlot;
    };
  };
  belt: {
    size: string;
    color: TechPackColor;
    leftEndText: string;
    rightEndText: string;
  };
  pant: {
    size: string;
    body: TechPackColor;
    reinforcement: TechPackColor;
    stitching: TechPackColor;
    drawcord: TechPackColor;
    logos: { leftThigh: TechPackLogoSlot; rightThigh: TechPackLogoSlot };
  };
}

// ---------------------------------------------------------------------------
// Real saved-design record shape (subset of CustomerDesignRecord returned by
// /api/customer-designs). Field names mirror the configurator exactly:
//   - colors are { hex, name|null }
//   - spec.kimono.logos carry only metadata; the actual image data URLs live
//     in configData.images.kimono / .pant, keyed by slot
//   - kimono logo slots:  'left-chest' | 'left-sleeve' | 'right-sleeve' | 'back'
//   - pant  logo slots:   'left-pant'  | 'right-pant'
// ---------------------------------------------------------------------------

interface SpecColor {
  hex: string;
  name: string | null;
}
interface ImageEntry {
  dataUrl?: string; // base64 logo art
  shopifyUrl?: string; // hosted fallback
  filename?: string;
}

export interface DesignRecord {
  configData: {
    spec: {
      kimono: {
        size: string;
        colors: {
          body: SpecColor;
          lapel: SpecColor;
          reinforcement: SpecColor;
          stitching: SpecColor;
        };
      };
      belt: {
        size: string;
        color: SpecColor;
        embroidery: { leftEnd: string; rightEnd: string };
      };
      pant: {
        size: string;
        colors: {
          body: SpecColor;
          reinforcement: SpecColor;
          stitching: SpecColor;
          drawcord: SpecColor;
        };
      };
    };
    images: {
      kimono?: Partial<Record<string, ImageEntry>>;
      pant?: Partial<Record<string, ImageEntry>>;
    };
  };
  thumbnailUrl?: string | null;
}

function color(c: SpecColor): TechPackColor {
  return { hex: c.hex || '#ffffff', name: c.name ?? 'Custom' };
}

function logo(entry?: ImageEntry): TechPackLogoSlot {
  const src = entry?.dataUrl || entry?.shopifyUrl;
  return src ? { dataUrl: src, caption: entry?.filename } : null;
}

export interface RenderUrls {
  front: string;
  back: string;
  left: string;
  right: string;
}

/**
 * Build TechPackData from a saved-design record.
 *
 * `renders` is supplied by the caller because the views are captured/stored
 * separately from the design spec. In production the webhook passes whatever
 * snapshot URLs are available; if omitted, the single stored `thumbnailUrl`
 * is used for the front view and the others fall back to empty (drawn as a
 * labelled empty box) until multi-view capture is wired up.
 */
export function fromDesignRecord(
  record: DesignRecord,
  orderNumber: string,
  renders?: Partial<RenderUrls>,
): TechPackData {
  const spec = record.configData.spec;
  const imgs = record.configData.images ?? {};
  const k = imgs.kimono ?? {};
  const p = imgs.pant ?? {};
  const thumb = record.thumbnailUrl ?? '';

  return {
    orderNumber,
    renders: {
      front: renders?.front ?? thumb,
      back: renders?.back ?? '',
      left: renders?.left ?? '',
      right: renders?.right ?? '',
    },
    kimono: {
      size: spec.kimono.size,
      body: color(spec.kimono.colors.body),
      lapel: color(spec.kimono.colors.lapel),
      reinforcement: color(spec.kimono.colors.reinforcement),
      stitching: color(spec.kimono.colors.stitching),
      logos: {
        leftChest: logo(k['left-chest']),
        leftSleeve: logo(k['left-sleeve']),
        rightSleeve: logo(k['right-sleeve']),
        back: logo(k['back']),
      },
    },
    belt: {
      size: spec.belt.size,
      color: color(spec.belt.color),
      leftEndText: spec.belt.embroidery.leftEnd ?? '',
      rightEndText: spec.belt.embroidery.rightEnd ?? '',
    },
    pant: {
      size: spec.pant.size,
      body: color(spec.pant.colors.body),
      reinforcement: color(spec.pant.colors.reinforcement),
      stitching: color(spec.pant.colors.stitching),
      drawcord: color(spec.pant.colors.drawcord),
      logos: {
        leftThigh: logo(p['left-pant']),
        rightThigh: logo(p['right-pant']),
      },
    },
  };
}
