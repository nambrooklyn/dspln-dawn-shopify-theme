import { memo, useEffect, useMemo, useState } from 'react';
import { Type, X } from 'lucide-react';

import {
  KIMONO_LOGO_SLOT_LABEL,
  KIMONO_LOGO_SLOTS,
  PANT_LOGO_SLOT_LABEL,
  PANT_LOGO_SLOTS,
  type KimonoLogoSlot,
  type PantLogoSlot,
} from './gi-config';
import type { KimonoLogo } from './gi-state';

/**
 * Studio-only text tool (v1): renders text to a transparent PNG and
 * applies it to any placement slot through the same pipeline as an
 * uploaded logo. Because the result IS artwork, saved designs, customer
 * links, carts, and the tech pack all handle it with zero extra code.
 */

const TEXT_FONTS = [
  { label: 'Arial Black', value: '"Arial Black", Arial, sans-serif' },
  { label: 'Impact', value: 'Impact, "Arial Black", sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
  { label: 'Brush Script', value: '"Brush Script MT", "Snell Roundhand", cursive' },
] as const;

type TextApplyTarget = `kimono:${KimonoLogoSlot}` | `pant:${PantLogoSlot}`;

const APPLY_TARGETS: Array<{ value: TextApplyTarget; label: string }> = [
  ...KIMONO_LOGO_SLOTS.map((slot) => ({
    value: `kimono:${slot}` as const,
    label: KIMONO_LOGO_SLOT_LABEL[slot].replace(/^Logo on /, ''),
  })),
  ...PANT_LOGO_SLOTS.map((slot) => ({
    value: `pant:${slot}` as const,
    label: PANT_LOGO_SLOT_LABEL[slot].replace(/^Logo on /, ''),
  })),
];

// Rendered large so the print/tech-pack export stays sharp. 1 canvas px
// is only a texture pixel — physical size comes from the slot anchor.
const FONT_PX = 220;
const PAD_PX = 30;

function renderTextImage(text: string, fontFamily: string, colorHex: string) {
  const clean = text.trim();
  if (!clean) return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const font = `${FONT_PX}px ${fontFamily}`;
  ctx.font = font;
  const metrics = ctx.measureText(clean);
  const ascent = metrics.actualBoundingBoxAscent || FONT_PX * 0.8;
  const descent = metrics.actualBoundingBoxDescent || FONT_PX * 0.25;
  canvas.width = Math.max(1, Math.ceil(metrics.width + PAD_PX * 2));
  canvas.height = Math.max(1, Math.ceil(ascent + descent + PAD_PX * 2));

  // Canvas state resets when its size changes — set the font again.
  ctx.font = font;
  ctx.fillStyle = colorHex;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(clean, PAD_PX, PAD_PX + ascent);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

async function dataUrlToFile(dataUrl: string, filename: string) {
  const blob = await fetch(dataUrl).then((response) => response.blob());
  return new File([blob], filename, { type: 'image/png' });
}

export const StudioTextTool = memo(
  ({
    onApplyKimonoLogo,
    onApplyPantLogo,
  }: {
    onApplyKimonoLogo: (slot: KimonoLogoSlot, logo: KimonoLogo) => void;
    onApplyPantLogo: (slot: PantLogoSlot, logo: KimonoLogo) => void;
  }) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [fontValue, setFontValue] = useState<string>(TEXT_FONTS[0].value);
    const [colorHex, setColorHex] = useState('#ffffff');
    const [applyTarget, setApplyTarget] =
      useState<TextApplyTarget>('kimono:back-skirt');

    useEffect(() => {
      if (typeof window === 'undefined') return;
      const openFromRail = () => setOpen(true);
      window.addEventListener('dspln:configurator-rail:text', openFromRail);
      return () =>
        window.removeEventListener('dspln:configurator-rail:text', openFromRail);
    }, []);

    const preview = useMemo(
      () => renderTextImage(text, fontValue, colorHex),
      [text, fontValue, colorHex],
    );

    const applyText = async () => {
      if (!preview) return;
      const slug =
        text
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40) || 'text';
      const filename = `text-${slug}.png`;
      const file = await dataUrlToFile(preview.dataUrl, filename);
      const logo: KimonoLogo = {
        imageUrl: URL.createObjectURL(file),
        imageWidth: preview.width,
        imageHeight: preview.height,
        filename,
        file,
      };

      const [part, slot] = applyTarget.split(':') as [
        'kimono' | 'pant',
        KimonoLogoSlot | PantLogoSlot,
      ];
      if (part === 'kimono') {
        onApplyKimonoLogo(slot as KimonoLogoSlot, logo);
      } else {
        onApplyPantLogo(slot as PantLogoSlot, logo);
      }
      setOpen(false);
    };

    if (!open) return null;

    return (
      <div className="border-border bg-background fixed top-[7.5rem] left-[calc(4.875rem+1.25rem)] z-50 w-80 rounded-lg border shadow-2xl">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-foreground text-xs font-semibold tracking-[0.16em] uppercase">
              Add Text
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Rendered as artwork in the chosen placement
            </p>
          </div>
          <button
            type="button"
            className="hover:bg-muted rounded-full p-1"
            aria-label="Close text tool"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[min(32rem,calc(100vh-10rem))] space-y-3 overflow-y-auto p-4">
          <label className="block">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
              Text
            </span>
            <input
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={60}
              placeholder="TEAM NAME"
              className="border-border focus:border-foreground mt-1 h-10 w-full rounded border bg-transparent px-3 text-sm outline-none"
            />
          </label>

          <label className="block">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
              Font
            </span>
            <select
              value={fontValue}
              onChange={(event) => setFontValue(event.target.value)}
              className="border-border bg-background text-foreground mt-1 h-9 w-full rounded border px-2 text-xs"
            >
              {TEXT_FONTS.map((font) => (
                <option key={font.label} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
              Color
            </span>
            <span className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={colorHex}
                onChange={(event) => setColorHex(event.target.value)}
                aria-label="Text color"
                className="border-border h-9 w-12 shrink-0 cursor-pointer rounded border bg-transparent p-1"
              />
              <input
                value={colorHex}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  setColorHex(value.startsWith('#') ? value : `#${value}`);
                }}
                spellCheck={false}
                className="border-border focus:border-foreground h-9 w-full rounded border bg-transparent px-3 font-mono text-xs uppercase outline-none"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
              Placement
            </span>
            <select
              value={applyTarget}
              onChange={(event) =>
                setApplyTarget(event.target.value as TextApplyTarget)
              }
              className="border-border bg-background text-foreground mt-1 h-9 w-full rounded border px-2 text-xs"
            >
              {APPLY_TARGETS.map((target) => (
                <option key={target.value} value={target.value}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>

          <div className="border-border rounded border">
            <p className="text-muted-foreground px-2 pt-2 text-[10px] font-semibold tracking-[0.14em] uppercase">
              Preview
            </p>
            <div
              className="m-2 flex min-h-16 items-center justify-center rounded p-2"
              style={{
                // Checkerboard so light and dark text both stay visible.
                backgroundImage:
                  'linear-gradient(45deg, #d9d9d9 25%, transparent 25%, transparent 75%, #d9d9d9 75%), linear-gradient(45deg, #d9d9d9 25%, #bfbfbf 25%, #bfbfbf 75%, #d9d9d9 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 8px 8px',
              }}
            >
              {preview ? (
                <img
                  src={preview.dataUrl}
                  alt="Text preview"
                  className="max-h-24 max-w-full object-contain"
                />
              ) : (
                <span className="text-muted-foreground text-xs">
                  Type something to preview
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={!preview}
            onClick={() => void applyText()}
            className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 flex h-10 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold tracking-[0.12em] uppercase transition-colors"
          >
            <Type className="h-4 w-4" />
            Apply Text
          </button>
        </div>
      </div>
    );
  },
);

StudioTextTool.displayName = 'StudioTextTool';
