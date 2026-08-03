import { memo, useEffect, useMemo, useState } from 'react';
import { RotateCw, Trash2, Type, X } from 'lucide-react';

import { renderTextImage, TEXT_FONTS } from '../shared/text-image';
import { useGiState, type GiTextLayer } from './gi-state';

/**
 * Studio-only text manager: add any number of free-placement text
 * layers, then drag them along the gi in the 3D view. Size and rotation
 * live here as sliders. Layers are pure spec data (+$10 each), so
 * saving, customer links, cart, and tech pack need no extra plumbing.
 */

function createTextLayerId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `text_${crypto.randomUUID()}`
    : `text_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export const StudioTextTool = memo(() => {
  const { addTextLayer, updateTextLayer, removeTextLayer, textLayers, computedKimonoAnchors } =
    useGiState();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [fontValue, setFontValue] = useState<string>(TEXT_FONTS[0].value);
  const [colorHex, setColorHex] = useState('#ffffff');

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

  const handleAdd = () => {
    if (!preview) return;
    // New text spawns on the left chest (a proven, exposed print spot —
    // dead-center chest sits under the lapel wrap) and is dragged from
    // there.
    const chest = computedKimonoAnchors?.['left-chest'];
    const layer: GiTextLayer = {
      id: createTextLayerId(),
      text: text.trim(),
      font: fontValue,
      colorHex,
      position: chest ?? [0.215, 2, 0.43],
      rotation: [0, 0, 0],
      rotateDeg: 0,
      scalePct: 100,
    };
    addTextLayer(layer);
    setText('');
  };

  if (!open) return null;

  return (
    <div className="border-border bg-background fixed top-[7.5rem] left-[calc(4.875rem+1.25rem)] z-50 w-[22rem] rounded-lg border shadow-2xl">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-foreground text-xs font-semibold tracking-[0.16em] uppercase">
            Text
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            +$10 per text · drag on the gi to place
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

      <div className="max-h-[min(34rem,calc(100vh-10rem))] space-y-3 overflow-y-auto p-4">
        <label className="block">
          <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
            New Text
          </span>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={60}
            placeholder="TEAM NAME"
            className="border-border focus:border-foreground mt-1 h-10 w-full rounded border bg-transparent px-3 text-sm outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
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
            <span className="mt-1 flex items-center gap-1">
              <input
                type="color"
                value={colorHex}
                onChange={(event) => setColorHex(event.target.value)}
                aria-label="Text color"
                className="border-border h-9 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-1"
              />
              <input
                value={colorHex}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  setColorHex(value.startsWith('#') ? value : `#${value}`);
                }}
                spellCheck={false}
                className="border-border focus:border-foreground h-9 w-full min-w-0 rounded border bg-transparent px-2 font-mono text-xs uppercase outline-none"
              />
            </span>
          </label>
        </div>

        <div
          className="flex min-h-14 items-center justify-center rounded p-2"
          style={{
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
              className="max-h-16 max-w-full object-contain"
            />
          ) : (
            <span className="text-muted-foreground text-xs">
              Type something to preview
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={!preview}
          onClick={handleAdd}
          className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 flex h-10 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold tracking-[0.12em] uppercase transition-colors"
        >
          <Type className="h-4 w-4" />
          Add Text · +$10
        </button>

        {textLayers.length > 0 ? (
          <ul className="space-y-2 pt-1">
            {textLayers.map((layer, index) => (
              <li key={layer.id} className="border-border rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="truncate text-sm font-semibold"
                    style={{ color: layer.colorHex }}
                    title={layer.text}
                  >
                    {index + 1}. {layer.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeTextLayer(layer.id)}
                    aria-label={`Delete text ${layer.text}`}
                    className="border-border text-muted-foreground hover:text-destructive hover:bg-muted flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <label className="mt-2 block">
                  <span className="text-muted-foreground flex justify-between text-[10px] font-semibold tracking-[0.12em] uppercase">
                    <span>Size</span>
                    <span>{layer.scalePct}%</span>
                  </span>
                  <input
                    type="range"
                    min={20}
                    max={300}
                    step={5}
                    value={layer.scalePct}
                    onChange={(event) =>
                      updateTextLayer(layer.id, {
                        scalePct: Number(event.target.value),
                      })
                    }
                    className="mt-1 w-full"
                  />
                </label>
                <label className="mt-1 block">
                  <span className="text-muted-foreground flex justify-between text-[10px] font-semibold tracking-[0.12em] uppercase">
                    <span className="flex items-center gap-1">
                      <RotateCw className="h-3 w-3" /> Rotate
                    </span>
                    <span>{layer.rotateDeg}°</span>
                  </span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={layer.rotateDeg}
                    onChange={(event) =>
                      updateTextLayer(layer.id, {
                        rotateDeg: Number(event.target.value),
                      })
                    }
                    className="mt-1 w-full"
                  />
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
});

StudioTextTool.displayName = 'StudioTextTool';
