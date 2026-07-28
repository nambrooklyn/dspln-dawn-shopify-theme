import { memo, useEffect, useMemo, useState } from 'react';
import { RotateCw, Trash2, Type, X } from 'lucide-react';

import { renderTextImage, TEXT_FONTS } from '../shared/text-image';
import { useGiState, type GiTextLayer } from './gi-state';

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
    const openFromRail = () => setOpen(true);
    window.addEventListener('dspln:configurator-rail:text', openFromRail);
    return () => window.removeEventListener('dspln:configurator-rail:text', openFromRail);
  }, []);

  const preview = useMemo(
    () => renderTextImage(text, fontValue, colorHex),
    [text, fontValue, colorHex],
  );

  const handleAdd = () => {
    if (!preview) return;
    const chest = computedKimonoAnchors?.['left-chest'];
    const layer: GiTextLayer = {
      id: createTextLayerId(),
      text: text.trim(),
      font: fontValue,
      colorHex,
      position: chest ?? [0.185, 1.835, 0.115],
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
          <p className="text-foreground text-xs font-semibold tracking-[0.16em] uppercase">Text</p>
          <p className="text-muted-foreground mt-1 text-xs">Drag text on the gi to place it</p>
        </div>
        <button type="button" className="hover:bg-muted rounded-full p-1" aria-label="Close text tool" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[min(34rem,calc(100vh-10rem))] space-y-3 overflow-y-auto p-4">
        <label className="block">
          <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">New Text</span>
          <input value={text} onChange={(event) => setText(event.target.value)} maxLength={60} placeholder="TEAM NAME" className="border-border focus:border-foreground mt-1 h-10 w-full rounded border bg-transparent px-3 text-sm outline-none" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">Font</span>
            <select value={fontValue} onChange={(event) => setFontValue(event.target.value)} className="border-border bg-background text-foreground mt-1 h-9 w-full rounded border px-2 text-xs">
              {TEXT_FONTS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">Color</span>
            <input type="color" value={colorHex} onChange={(event) => setColorHex(event.target.value)} className="border-border mt-1 h-9 w-full cursor-pointer rounded border bg-transparent p-1" />
          </label>
        </div>
        {preview ? <img src={preview.dataUrl} alt="Text preview" className="mx-auto max-h-16 max-w-full object-contain" /> : null}
        <button type="button" disabled={!preview} onClick={handleAdd} className="bg-foreground text-background disabled:opacity-40 flex h-10 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold tracking-[0.12em] uppercase">
          <Type className="h-4 w-4" /> Add Text
        </button>
        {textLayers.map((layer, index) => (
          <div key={layer.id} className="border-border rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{index + 1}. {layer.text}</p>
              <button type="button" onClick={() => removeTextLayer(layer.id)} aria-label={`Delete text ${layer.text}`} className="border-border rounded border p-1"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <label className="mt-2 block">
              <span className="text-muted-foreground flex justify-between text-[10px] font-semibold uppercase"><span>Size</span><span>{layer.scalePct}%</span></span>
              <input type="range" min={20} max={300} step={5} value={layer.scalePct} onChange={(event) => updateTextLayer(layer.id, { scalePct: Number(event.target.value) })} className="w-full" />
            </label>
            <label className="mt-1 block">
              <span className="text-muted-foreground flex justify-between text-[10px] font-semibold uppercase"><span className="flex items-center gap-1"><RotateCw className="h-3 w-3" /> Rotate</span><span>{layer.rotateDeg}°</span></span>
              <input type="range" min={-180} max={180} step={5} value={layer.rotateDeg} onChange={(event) => updateTextLayer(layer.id, { rotateDeg: Number(event.target.value) })} className="w-full" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
});

StudioTextTool.displayName = 'StudioTextTool';
