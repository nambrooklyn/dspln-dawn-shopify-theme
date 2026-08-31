import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ImageIcon, Layers3, Redo2, Shapes, Smile, Type, Undo2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * DSPLN Artwork Editor — the deterministic, artwork-only editing engine.
 *
 * Extracted from the configurator Design Assistant so the same engine backs
 * both the in-configurator cleanup modal and the standalone Artwork Studio.
 * Nothing in this file calls an image-generation model: background removal,
 * brushes, crop, text, compositing, undo/redo and zoom are all local canvas
 * work. Generative edits live in ./artwork-assistant.
 */

export const MAX_ARTWORK_BYTES = 6_000_000;

export interface AttachedArtwork {
  id: string;
  url: string;
  previewUrl: string;
  filename: string;
  width: number;
  height: number;
}

export const readArtworkFile = async (file: File) => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Artwork could not be read'));
    reader.readAsDataURL(file);
  });

  const dimensions = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Artwork is not a valid image'));
      image.src = dataUrl;
    },
  );

  return { dataUrl, dimensions };
};

export const removeEdgeConnectedLightBackground = async (
  dataUrl: string,
  cleanupStrength = 0,
) => {
  // The slider starts at 1 after the first cleanup, but its minimum must be
  // identical to the original conservative remover. Only values above 1 add
  // the aggressive disconnected-pixel pass; remap 1..100 to 0..100 so the
  // maximum retains its previous reach.
  const effectiveStrength =
    cleanupStrength <= 1 ? 0 : ((cleanupStrength - 1) / 99) * 100;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error('Artwork could not be processed'));
    next.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  if (canvas.width * canvas.height > 20_000_000) {
    throw new Error('Artwork is too large to process');
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Artwork could not be processed');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = pixels;
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;

  const isLightBackground = (index: number) => {
    const offset = index * 4;
    if (data[offset + 3] === 0) return true;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const darkest = Math.min(red, green, blue);
    const lightest = Math.max(red, green, blue);
    const minimumBrightness = Math.round(224 - effectiveStrength * 1.35);
    const maximumColorSpread = Math.round(24 + effectiveStrength * 0.36);
    return (
      darkest >= minimumBrightness &&
      lightest - darkest <= maximumColorSpread
    );
  };
  const enqueue = (index: number) => {
    if (visited[index] || !isLightBackground(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    data[index * 4 + 3] = 0;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  // A stronger cleanup also removes disconnected neutral pixels, which is
  // necessary for isolated drop-shadow remnants. Recompute from the original
  // for every slider change so cleanup never compounds destructively.
  if (effectiveStrength > 0) {
    for (let index = 0; index < width * height; index += 1) {
      if (isLightBackground(index)) data[index * 4 + 3] = 0;
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
};

export function ArtworkEditor({
  imageUrl,
  originalUrl,
  onChange,
  onDimensionsChange,
  onRemoveBackground,
  onClose,
}: {
  imageUrl: string;
  originalUrl: string;
  onChange: (dataUrl: string) => void;
  onDimensionsChange: (width: number, height: number) => void;
  onRemoveBackground: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalPixelsRef = useRef<ImageData | null>(null);
  const drawingRef = useRef(false);
  const [tool, setTool] = useState<'restore' | 'erase'>('restore');
  const [brushSize, setBrushSize] = useState(36);
  const [panel, setPanel] = useState<'cleanup' | 'crop' | 'text' | 'image'>('cleanup');
  const [cropInsets, setCropInsets] = useState({ left: 0, top: 0, right: 0, bottom: 0 });
  const [textValue, setTextValue] = useState('');
  const [textColor, setTextColor] = useState('#111111');
  const [textSize, setTextSize] = useState(12);
  const [textPosition, setTextPosition] = useState({ x: 50, y: 50 });
  const [overlayUrl, setOverlayUrl] = useState('');
  const [overlayScale, setOverlayScale] = useState(45);
  const [overlayPosition, setOverlayPosition] = useState({ x: 50, y: 50 });
  const [brushCursor, setBrushCursor] = useState({ x: 0, y: 0, visible: false });
  const [history, setHistory] = useState<string[]>([imageUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [zoom, setZoom] = useState(75);
  const extraImageInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  historyRef.current = history;
  historyIndexRef.current = historyIndex;

  const commitSnapshot = useCallback((dataUrl: string) => {
    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    if (next[next.length - 1] !== dataUrl) next.push(dataUrl);
    const bounded = next.slice(-30);
    setHistory(bounded);
    setHistoryIndex(bounded.length - 1);
    onChange(dataUrl);
  }, [onChange]);

  const moveThroughHistory = useCallback((direction: -1 | 1) => {
    const nextIndex = Math.min(
      historyRef.current.length - 1,
      Math.max(0, historyIndexRef.current + direction),
    );
    if (nextIndex === historyIndexRef.current) return;
    const snapshot = historyRef.current[nextIndex];
    setHistoryIndex(nextIndex);
    onChange(snapshot);
  }, [onChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        moveThroughHistory(event.shiftKey ? 1 : -1);
      } else if (key === 'y') {
        event.preventDefault();
        moveThroughHistory(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moveThroughHistory]);

  useEffect(() => {
    let cancelled = false;
    const load = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
    void Promise.all([load(imageUrl), load(originalUrl)]).then(
      ([current, original]) => {
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = current.naturalWidth;
        canvas.height = current.naturalHeight;
        onDimensionsChange(canvas.width, canvas.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(current, 0, 0, canvas.width, canvas.height);
        const originalCanvas = document.createElement('canvas');
        originalCanvas.width = canvas.width;
        originalCanvas.height = canvas.height;
        const originalContext = originalCanvas.getContext('2d', {
          willReadFrequently: true,
        });
        if (!originalContext) return;
        originalContext.drawImage(original, 0, 0, canvas.width, canvas.height);
        originalPixelsRef.current = originalContext.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [imageUrl, originalUrl]);

  const paint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const original = originalPixelsRef.current;
    if (!canvas || !original) return;
    const bounds = canvas.getBoundingClientRect();
    const centerX = Math.round(
      ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    );
    const centerY = Math.round(
      ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    );
    const displayScale = canvas.width / Math.max(bounds.width, 1);
    const radius = Math.max(2, Math.round((brushSize * displayScale) / 2));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const left = Math.max(0, centerX - radius);
    const top = Math.max(0, centerY - radius);
    const right = Math.min(canvas.width, centerX + radius + 1);
    const bottom = Math.min(canvas.height, centerY + radius + 1);
    const patch = context.getImageData(left, top, right - left, bottom - top);

    for (let y = 0; y < patch.height; y += 1) {
      for (let x = 0; x < patch.width; x += 1) {
        const imageX = left + x;
        const imageY = top + y;
        const distance = Math.hypot(imageX - centerX, imageY - centerY);
        if (distance > radius) continue;
        const patchOffset = (y * patch.width + x) * 4;
        if (tool === 'erase') {
          patch.data[patchOffset + 3] = 0;
        } else {
          const sourceOffset = (imageY * canvas.width + imageX) * 4;
          patch.data[patchOffset] = original.data[sourceOffset];
          patch.data[patchOffset + 1] = original.data[sourceOffset + 1];
          patch.data[patchOffset + 2] = original.data[sourceOffset + 2];
          patch.data[patchOffset + 3] = original.data[sourceOffset + 3];
        }
      }
    }
    context.putImageData(patch, left, top);
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canvasRef.current) return;
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    commitSnapshot(canvasRef.current.toDataURL('image/png'));
  };

  const applyCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const left = Math.round((cropInsets.left / 100) * canvas.width);
    const top = Math.round((cropInsets.top / 100) * canvas.height);
    const right = Math.round((cropInsets.right / 100) * canvas.width);
    const bottom = Math.round((cropInsets.bottom / 100) * canvas.height);
    const width = canvas.width - left - right;
    const height = canvas.height - top - bottom;
    if (width < 2 || height < 2) return;
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    output.getContext('2d')?.drawImage(canvas, left, top, width, height, 0, 0, width, height);
    onDimensionsChange(width, height);
    commitSnapshot(output.toDataURL('image/png'));
    setCropInsets({ left: 0, top: 0, right: 0, bottom: 0 });
    setPanel('cleanup');
  };

  const applyText = () => {
    const canvas = canvasRef.current;
    const value = textValue.trim();
    if (!canvas || !value) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const fontSize = Math.max(12, Math.round((textSize / 100) * canvas.width));
    context.save();
    context.font = `700 ${fontSize}px Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = textColor;
    context.fillText(
      value,
      (textPosition.x / 100) * canvas.width,
      (textPosition.y / 100) * canvas.height,
    );
    context.restore();
    commitSnapshot(canvas.toDataURL('image/png'));
    setTextValue('');
    setPanel('cleanup');
  };

  const chooseExtraImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !['image/png', 'image/jpeg'].includes(file.type)) return;
    const { dataUrl } = await readArtworkFile(file);
    setOverlayUrl(dataUrl);
  };

  const applyExtraImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !overlayUrl) return;
    const overlay = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = overlayUrl;
    });
    const maxWidth = canvas.width * (overlayScale / 100);
    const maxHeight = canvas.height * (overlayScale / 100);
    const scale = Math.min(maxWidth / overlay.naturalWidth, maxHeight / overlay.naturalHeight);
    const width = overlay.naturalWidth * scale;
    const height = overlay.naturalHeight * scale;
    canvas.getContext('2d')?.drawImage(
      overlay,
      (overlayPosition.x / 100) * canvas.width - width / 2,
      (overlayPosition.y / 100) * canvas.height - height / 2,
      width,
      height,
    );
    commitSnapshot(canvas.toDataURL('image/png'));
    setOverlayUrl('');
    setPanel('cleanup');
  };

  const cropBox = {
    left: `${cropInsets.left}%`,
    top: `${cropInsets.top}%`,
    right: `${cropInsets.right}%`,
    bottom: `${cropInsets.bottom}%`,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f7f7f8]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#dedede] bg-white px-3">
        <div className="flex overflow-hidden rounded-lg border border-[#dedede] bg-white shadow-sm">
          <button type="button" onClick={() => moveThroughHistory(-1)} disabled={historyIndex === 0} title="Undo (Ctrl/Cmd+Z)" className="inline-flex h-9 items-center gap-1.5 border-r border-[#dedede] px-3 text-xs font-medium disabled:opacity-30"><Undo2 className="h-4 w-4" /> Undo</button>
          <button type="button" onClick={() => moveThroughHistory(1)} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)" aria-label="Redo" className="inline-flex h-9 w-10 items-center justify-center disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-[#dedede] bg-white shadow-sm">
          <button type="button" onClick={() => setZoom((value) => Math.max(25, value - 25))} aria-label="Zoom out" className="inline-flex h-9 w-10 items-center justify-center border-r border-[#dedede]"><ZoomOut className="h-4 w-4" /></button>
          <span className="inline-flex h-9 min-w-16 items-center justify-center px-3 text-xs font-medium">{zoom}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(200, value + 25))} aria-label="Zoom in" className="inline-flex h-9 w-10 items-center justify-center border-l border-[#dedede]"><ZoomIn className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={onClose} aria-label="Close artwork editor" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#dedede] bg-white shadow-sm"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[82px] shrink-0 flex-col items-stretch border-r border-[#dedede] bg-white py-2">
          <button type="button" onClick={() => setPanel('cleanup')} className={`flex h-[70px] flex-col items-center justify-center gap-1 text-[10px] font-medium ${panel === 'cleanup' ? 'bg-[#eeeeef]' : 'hover:bg-[#f7f7f8]'}`}><Layers3 className="h-5 w-5" />Elements</button>
          <button type="button" onClick={() => setPanel('image')} className={`flex h-[70px] flex-col items-center justify-center gap-1 text-[10px] font-medium ${panel === 'image' ? 'bg-[#eeeeef]' : 'hover:bg-[#f7f7f8]'}`}><Upload className="h-5 w-5" />Uploads</button>
          <button type="button" onClick={() => setPanel('cleanup')} className="flex h-[70px] flex-col items-center justify-center gap-1 text-[10px] font-medium hover:bg-[#f7f7f8]"><ImageIcon className="h-5 w-5" />Images</button>
          <button type="button" onClick={() => setPanel('text')} className={`flex h-[70px] flex-col items-center justify-center gap-1 text-[10px] font-medium ${panel === 'text' ? 'bg-[#eeeeef]' : 'hover:bg-[#f7f7f8]'}`}><Type className="h-5 w-5" />Text</button>
          <button type="button" onClick={() => setPanel('crop')} className={`flex h-[70px] flex-col items-center justify-center gap-1 text-[10px] font-medium ${panel === 'crop' ? 'bg-[#eeeeef]' : 'hover:bg-[#f7f7f8]'}`}><Shapes className="h-5 w-5" />Shapes</button>
          <button type="button" onClick={() => document.getElementById('artwork-editor-ai-prompt')?.focus()} className="flex h-[70px] flex-col items-center justify-center gap-1 text-[10px] font-medium hover:bg-[#f7f7f8]"><Smile className="h-5 w-5" />Stickers</button>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
      <div className="z-10 flex min-h-14 shrink-0 items-center justify-center border-b border-[#dedede] bg-[#f7f7f8] px-4 py-2">
        <div className="w-fit max-w-full rounded-2xl border border-[#dedede] bg-white px-3 py-2 shadow-sm">
        {panel === 'cleanup' ? <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onRemoveBackground} className="h-8 rounded-lg border border-[#d7d0c8] bg-white px-3 text-[10px] font-semibold text-[#202124] hover:bg-[#f3f3f4]">Remove background</button>
          <span className="h-5 w-px bg-[#dedede]" />
          <button type="button" onClick={() => setTool('restore')} className={`h-8 rounded-lg px-3 text-[10px] font-semibold ${tool === 'restore' ? 'bg-[#202124] text-white' : 'border border-[#d7d0c8] text-[#202124]'}`}>Restore details</button>
          <button type="button" onClick={() => setTool('erase')} className={`h-8 rounded-lg px-3 text-[10px] font-semibold ${tool === 'erase' ? 'bg-[#202124] text-white' : 'border border-[#d7d0c8] text-[#202124]'}`}>Erase leftovers</button>
          <label className="ml-auto flex items-center gap-2 text-[10px] font-semibold text-[#202124]">Brush size<input type="range" min="8" max="100" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="w-28 accent-[#202124]" /></label>
        </div> : null}
        {panel === 'crop' ? <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          {(['left', 'top', 'right', 'bottom'] as const).map((edge) => <label key={edge} className="text-[9px] font-semibold capitalize text-[#202124]">{edge}<input type="range" min="0" max="45" value={cropInsets[edge]} onChange={(event) => setCropInsets((current) => ({ ...current, [edge]: Number(event.target.value) }))} className="block w-full accent-[#202124]" /></label>)}
          <button type="button" onClick={applyCrop} className="col-span-2 h-8 rounded-lg bg-[#202124] px-4 text-[10px] font-semibold text-white sm:col-start-4 sm:col-span-1">Apply crop</button>
        </div> : null}
        {panel === 'text' ? <div className="flex flex-wrap items-center gap-2">
          <input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Enter text" className="h-8 min-w-40 flex-1 rounded-full border border-[#d7d0c8] px-3 text-xs" />
          <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} aria-label="Text color" className="h-8 w-10" />
          <label className="flex items-center gap-2 text-[9px] font-semibold text-[#202124]">Size<input type="range" min="3" max="30" value={textSize} onChange={(event) => setTextSize(Number(event.target.value))} className="w-24 accent-[#202124]" /></label>
          <label className="flex items-center gap-1 text-[9px] font-semibold text-[#202124]">X<input type="range" min="5" max="95" value={textPosition.x} onChange={(event) => setTextPosition((current) => ({ ...current, x: Number(event.target.value) }))} className="w-16 accent-[#202124]" /></label>
          <label className="flex items-center gap-1 text-[9px] font-semibold text-[#202124]">Y<input type="range" min="5" max="95" value={textPosition.y} onChange={(event) => setTextPosition((current) => ({ ...current, y: Number(event.target.value) }))} className="w-16 accent-[#202124]" /></label>
          <button type="button" onClick={applyText} disabled={!textValue.trim()} className="h-8 rounded-lg bg-[#202124] px-4 text-[10px] font-semibold text-white disabled:opacity-40">Add text</button>
        </div> : null}
        {panel === 'image' ? <div className="flex flex-wrap items-center gap-2">
          <input ref={extraImageInputRef} type="file" accept="image/png,image/jpeg" onChange={(event) => void chooseExtraImage(event)} className="hidden" />
          <button type="button" onClick={() => extraImageInputRef.current?.click()} className="h-8 rounded-lg border border-[#d7d0c8] px-4 text-[10px] font-semibold text-[#202124]">Choose image</button>
          {overlayUrl ? <><img src={overlayUrl} alt="Additional artwork" className="h-8 w-8 rounded object-contain" /><label className="flex flex-1 items-center gap-2 text-[9px] font-semibold text-[#5c0000]">Size<input type="range" min="10" max="100" value={overlayScale} onChange={(event) => setOverlayScale(Number(event.target.value))} className="w-full accent-[#5c0000]" /></label><label className="flex items-center gap-1 text-[9px] font-semibold text-[#5c0000]">X<input type="range" min="5" max="95" value={overlayPosition.x} onChange={(event) => setOverlayPosition((current) => ({ ...current, x: Number(event.target.value) }))} className="w-16 accent-[#5c0000]" /></label><label className="flex items-center gap-1 text-[9px] font-semibold text-[#5c0000]">Y<input type="range" min="5" max="95" value={overlayPosition.y} onChange={(event) => setOverlayPosition((current) => ({ ...current, y: Number(event.target.value) }))} className="w-16 accent-[#5c0000]" /></label><button type="button" onClick={() => void applyExtraImage()} className="h-8 rounded-full bg-[#5c0000] px-4 text-[10px] font-semibold text-white">Add to artwork</button></> : <span className="text-[10px] text-[#8a8580]">Add another logo or image, then set its size and position.</span>}
        </div> : null}
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 items-start justify-center overflow-auto overscroll-contain bg-[#f5f5f6] p-8"
      >
        <div className="relative inline-flex max-w-none border-2 border-[#4564ff] shadow-xl" style={{ width: `${zoom}%`, backgroundColor: '#fff', backgroundImage: 'linear-gradient(45deg, #e2e2e2 25%, transparent 25%), linear-gradient(-45deg, #e2e2e2 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e2e2 75%), linear-gradient(-45deg, transparent 75%, #e2e2e2 75%)', backgroundSize: '24px 24px', backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px' }}>
        <canvas
          ref={canvasRef}
          className={`h-auto w-full max-w-none touch-none object-contain ${panel === 'cleanup' ? 'cursor-none' : 'cursor-default'}`}
          onPointerDown={(event) => {
            if (panel !== 'cleanup') return;
            drawingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            paint(event);
          }}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setBrushCursor({
              x: event.clientX - bounds.left,
              y: event.clientY - bounds.top,
              visible: panel === 'cleanup',
            });
            if (panel === 'cleanup' && drawingRef.current) paint(event);
          }}
          onPointerEnter={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setBrushCursor({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, visible: panel === 'cleanup' });
          }}
          onPointerLeave={() => {
            if (!drawingRef.current) setBrushCursor((current) => ({ ...current, visible: false }));
          }}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
        {panel === 'cleanup' && brushCursor.visible ? <div aria-hidden="true" className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(92,0,0,0.95)]" style={{ width: brushSize, height: brushSize, left: brushCursor.x - brushSize / 2, top: brushCursor.y - brushSize / 2 }} /> : null}
        {panel === 'crop' ? <div className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.48)]" style={cropBox}><span className="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full border-2 border-[#5c0000] bg-white" /><span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full border-2 border-[#5c0000] bg-white" /><span className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full border-2 border-[#5c0000] bg-white" /><span className="absolute -right-1.5 -bottom-1.5 h-3 w-3 rounded-full border-2 border-[#5c0000] bg-white" /></div> : null}
        <span className="pointer-events-none absolute -top-2 -left-2 h-3.5 w-3.5 rounded-full border-2 border-[#4564ff] bg-white" /><span className="pointer-events-none absolute -top-2 -right-2 h-3.5 w-3.5 rounded-full border-2 border-[#4564ff] bg-white" /><span className="pointer-events-none absolute -bottom-2 -left-2 h-3.5 w-3.5 rounded-full border-2 border-[#4564ff] bg-white" /><span className="pointer-events-none absolute -right-2 -bottom-2 h-3.5 w-3.5 rounded-full border-2 border-[#4564ff] bg-white" />
        </div>
      </div>
        </main>
      </div>
    </div>
  );
}

/** Legacy alias — the configurator Design Assistant imports this name. */
export const CleanupBrushCanvas = ArtworkEditor;
