import {
  memo,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  Lock,
  LockOpen,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  Type,
  X,
} from 'lucide-react';

import { RashguardColorField } from '../short-sleeve-rashguard/rashguard-color-picker';
import {
  RASHGUARD_ARTWORK_TARGET_LABELS,
  RASHGUARD_ARTWORK_TARGETS,
  RASHGUARD_COLOR_SWATCHES,
  RASHGUARD_PART_LABELS,
  RASHGUARD_SIZE_OPTIONS,
  nameForHex,
  type RashguardArtworkTarget,
  type RashguardPart,
} from '../short-sleeve-rashguard/rashguard-config';
import {
  useRashguardState,
  type RashguardArtworkLayer,
} from '../short-sleeve-rashguard/rashguard-state';

/* ---------------------------------------------------------------- shared -- */

/** Vectary-style floating card: soft white, no hard chrome. */
const panelCardClass =
  'pointer-events-auto rounded-2xl bg-white/92 shadow-[0_8px_32px_rgba(0,0,0,0.14)] backdrop-blur-md';

const pillButtonClass =
  'pointer-events-auto flex h-10 items-center justify-center gap-2 rounded-full bg-white/95 px-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-black shadow-[0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur-sm transition hover:bg-black hover:text-white';

const tinyIconButtonClass =
  'flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white text-black/60 transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-30';

function PanelClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="flex h-7 w-7 items-center justify-center rounded-full text-black/45 transition hover:bg-black/5 hover:text-black"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/* ----------------------------------------------------------- color panel -- */

export const V2ColorPanel = memo(
  ({ part, onClose }: { part: RashguardPart; onClose: () => void }) => {
    const { partColors, setPartColor } = useRashguardState();
    const value = partColors[part];
    const currentName =
      RASHGUARD_COLOR_SWATCHES.find(
        (s) => s.hex.toLowerCase() === value.toLowerCase(),
      )?.name ??
      nameForHex(value) ??
      'Custom';
    const inUseColors = Array.from(
      new Set(Object.values(partColors).map((hex) => hex.toLowerCase())),
    );

    return (
      <div className={`${panelCardClass} px-4 py-3`}>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-black">
              {RASHGUARD_PART_LABELS[part]}
            </span>
            <span className="truncate text-[10px] font-medium uppercase tracking-wide text-black/45">
              {currentName}
            </span>
          </div>
          <PanelClose onClose={onClose} />
        </div>
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-5 gap-2">
            {RASHGUARD_COLOR_SWATCHES.map((swatch) => {
              const isActive = swatch.hex.toLowerCase() === value.toLowerCase();
              const isWhite = swatch.hex.toLowerCase() === '#ffffff';
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.name}
                  aria-label={swatch.name}
                  aria-pressed={isActive}
                  onClick={() => setPartColor(part, swatch.hex)}
                  className={`h-8 w-8 rounded-full transition-transform ${
                    isActive
                      ? 'ring-2 ring-[#5c0000] ring-offset-2 ring-offset-white'
                      : 'hover:scale-110'
                  } ${isWhite ? 'border border-black/25' : 'border border-black/5'}`}
                  style={{ backgroundColor: swatch.hex }}
                />
              );
            })}
          </div>
          <div className="ml-1 border-l border-black/10 pl-3">
            <RashguardColorField
              value={value}
              label={RASHGUARD_PART_LABELS[part]}
              inUseColors={inUseColors}
              onChange={(hex) => setPartColor(part, hex)}
            />
          </div>
        </div>
      </div>
    );
  },
);
V2ColorPanel.displayName = 'V2ColorPanel';

/* ------------------------------------------------------------ logo panel -- */

// Same PNG transparent-padding trim as the v1 upload flow, so an uploaded
// logo's bounding box (and its priced size on the garment) matches v1 exactly.
async function trimTransparentPadding(file: File): Promise<{
  file: File;
  dimensions: { width: number; height: number };
}> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => resolve(null);
      next.src = url;
    });

    if (!img) return { file, dimensions: { width: 0, height: 0 } };

    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (width <= 0 || height <= 0 || file.type !== 'image/png') {
      return { file, dimensions: { width, height } };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { file, dimensions: { width, height } };

    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha <= 8) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      return { file, dimensions: { width, height } };
    }

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    if (cropWidth === width && cropHeight === height) {
      return { file, dimensions: { width, height } };
    }

    const output = document.createElement('canvas');
    output.width = cropWidth;
    output.height = cropHeight;
    const outputCtx = output.getContext('2d');
    if (!outputCtx) return { file, dimensions: { width, height } };
    outputCtx.drawImage(
      canvas,
      minX,
      minY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      output.toBlob(resolve, 'image/png'),
    );
    if (!blob) return { file, dimensions: { width, height } };

    return {
      file: new File([blob], file.name, { type: 'image/png' }),
      dimensions: { width: cropWidth, height: cropHeight },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const V2LogoPanel = memo(
  ({
    label,
    target,
    onUpload,
    onAddText,
    onClose,
  }: {
    label: string;
    target: RashguardArtworkTarget;
    onUpload: (
      file: File,
      dimensions: { width: number; height: number },
    ) => void;
    onAddText: () => void;
    onClose: () => void;
  }) => {
    const fileRef = useRef<HTMLInputElement>(null);

    const handleInputChange = useCallback(
      async (event: ChangeEvent<HTMLInputElement>) => {
        const file = Array.from(event.target.files ?? []).find((candidate) =>
          ['image/png', 'image/jpeg'].includes(candidate.type),
        );
        event.target.value = '';
        if (!file) return;
        const result = await trimTransparentPadding(file);
        onUpload(result.file, result.dimensions);
      },
      [onUpload],
    );

    return (
      <div className={`${panelCardClass} px-4 py-3`}>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-black">
            {label}
          </span>
          <PanelClose onClose={onClose} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-10 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-black transition hover:bg-black hover:text-white"
          >
            <ImagePlus className="h-4 w-4" />
            Upload Logo
          </button>
          <button
            type="button"
            onClick={onAddText}
            className="flex h-10 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-black transition hover:bg-black hover:text-white"
          >
            <Type className="h-4 w-4" />
            Add Text
          </button>
        </div>
        <p className="mt-2 text-[10px] text-black/40">
          Lands on the {RASHGUARD_ARTWORK_TARGET_LABELS[target].toLowerCase()} —
          drag it on the garment to fine-tune.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleInputChange}
          aria-label="Upload logo image"
        />
      </div>
    );
  },
);
V2LogoPanel.displayName = 'V2LogoPanel';

/* ----------------------------------------------------------- size pill --- */

export const V2SizePill = memo(() => {
  const { size, setSize } = useRashguardState();
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={pillButtonClass}
        aria-expanded={open}
      >
        Size · {size}
      </button>
      {open ? (
        <div className={`${panelCardClass} grid grid-cols-4 gap-1 p-1.5`}>
          {RASHGUARD_SIZE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSize(option);
                setOpen(false);
              }}
              className={`flex h-9 min-w-11 items-center justify-center rounded-full text-[11px] font-semibold uppercase transition ${
                option === size
                  ? 'bg-black text-white'
                  : 'text-black hover:bg-black/5'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
V2SizePill.displayName = 'V2SizePill';

/* -------------------------------------------------------- layer editor --- */

function SwatchRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/45">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {RASHGUARD_COLOR_SWATCHES.map((swatch) => (
          <button
            key={`${label}-${swatch.hex}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(swatch.hex)}
            className={`h-5 w-5 rounded-full border ${
              value.toLowerCase() === swatch.hex.toLowerCase()
                ? 'ring-2 ring-[#5c0000] ring-offset-1'
                : 'border-black/10'
            } disabled:opacity-40`}
            style={{ backgroundColor: swatch.hex }}
            title={swatch.name}
            aria-label={`${label} ${swatch.name}`}
          />
        ))}
        {!disabled ? (
          <RashguardColorField
            value={value}
            label={label}
            inUseColors={[]}
            onChange={onChange}
          />
        ) : null}
      </div>
    </div>
  );
}

const V2_TEXT_FONT_OPTIONS = [
  'Arial',
  'Arial Black',
  'Georgia',
  'Impact',
  'Times New Roman',
  'Verdana',
] as const;

/**
 * Compact floating editor for the selected artwork/text layer. Exposes every
 * v1 layer control (target, nudge, scale, rotate, order, lock, hide,
 * duplicate, delete, text/font/fill/outline) in one small card.
 */
export const V2LayerEditor = memo(
  ({ layer, onClose }: { layer: RashguardArtworkLayer; onClose: () => void }) => {
    const {
      artworkLayers,
      updateArtworkLayer,
      duplicateArtworkLayer,
      removeArtworkLayer,
      moveArtworkLayer,
      selectArtworkLayer,
    } = useRashguardState();
    const [showMore, setShowMore] = useState(false);
    const index = artworkLayers.findIndex((item) => item.id === layer.id);
    const locked = layer.locked;

    return (
      <div className={`${panelCardClass} w-[19rem] max-w-[calc(100vw-1.5rem)] px-4 py-3`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-black/5">
              {layer.kind === 'image' && layer.imageUrl ? (
                <img
                  src={layer.imageUrl}
                  alt=""
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <Type className="h-3.5 w-3.5 text-black/50" />
              )}
            </span>
            <span className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-black">
              {layer.kind === 'text' ? layer.text || 'Text' : layer.filename}
            </span>
          </div>
          <PanelClose
            onClose={() => {
              selectArtworkLayer(null);
              onClose();
            }}
          />
        </div>

        {layer.kind === 'text' ? (
          <div className="mb-2 space-y-2">
            <input
              value={layer.text ?? ''}
              disabled={locked}
              onChange={(event) =>
                updateArtworkLayer(layer.id, { text: event.target.value })
              }
              className="h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 text-[13px] text-black"
              aria-label="Text"
            />
            <select
              value={layer.fontFamily ?? 'Arial'}
              disabled={locked}
              onChange={(event) =>
                updateArtworkLayer(layer.id, { fontFamily: event.target.value })
              }
              className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-[12px] text-black"
              aria-label="Font"
            >
              {V2_TEXT_FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
            <SwatchRow
              label="Fill"
              value={layer.color ?? '#ffffff'}
              disabled={locked}
              onChange={(color) => updateArtworkLayer(layer.id, { color })}
            />
            <SwatchRow
              label="Outline"
              value={layer.outlineColor ?? '#000000'}
              disabled={locked}
              onChange={(outlineColor) =>
                updateArtworkLayer(layer.id, { outlineColor })
              }
            />
            <label className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/45">
              Outline Width
              <input
                type="range"
                min="0"
                max="36"
                step="0.5"
                value={layer.outlineWidth ?? 6}
                disabled={locked}
                onChange={(event) =>
                  updateArtworkLayer(layer.id, {
                    outlineWidth: Number(event.target.value),
                  })
                }
                className="mt-1 block w-full accent-black"
              />
            </label>
          </div>
        ) : null}

        <label className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/45">
          Size
          <input
            type="range"
            min="0.2"
            max="4"
            step="0.025"
            value={layer.scale}
            disabled={locked}
            onChange={(event) =>
              updateArtworkLayer(layer.id, { scale: Number(event.target.value) })
            }
            className="mt-1 block w-full accent-black"
          />
        </label>
        <label className="mt-1.5 block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/45">
          Rotation
          <input
            type="range"
            min="-180"
            max="180"
            step="1"
            value={layer.rotationDeg}
            disabled={locked}
            onChange={(event) =>
              updateArtworkLayer(layer.id, {
                rotationDeg: Number(event.target.value),
              })
            }
            className="mt-1 block w-full accent-black"
          />
        </label>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={tinyIconButtonClass}
            disabled={locked}
            onClick={() => updateArtworkLayer(layer.id, { x: layer.x - 0.025 })}
            title="Nudge left"
            aria-label="Nudge left"
          >
            <MoveHorizontal className="h-3.5 w-3.5 -scale-x-100" />
          </button>
          <button
            type="button"
            className={tinyIconButtonClass}
            disabled={locked}
            onClick={() => updateArtworkLayer(layer.id, { x: layer.x + 0.025 })}
            title="Nudge right"
            aria-label="Nudge right"
          >
            <MoveHorizontal className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={tinyIconButtonClass}
            disabled={locked}
            onClick={() => updateArtworkLayer(layer.id, { y: layer.y + 0.025 })}
            title="Nudge up"
            aria-label="Nudge up"
          >
            <MoveVertical className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={tinyIconButtonClass}
            disabled={locked}
            onClick={() => updateArtworkLayer(layer.id, { y: layer.y - 0.025 })}
            title="Nudge down"
            aria-label="Nudge down"
          >
            <MoveVertical className="h-3.5 w-3.5 rotate-180" />
          </button>
          <button
            type="button"
            className={tinyIconButtonClass}
            disabled={locked}
            onClick={() =>
              updateArtworkLayer(layer.id, { scale: layer.scale - 0.05 })
            }
            title="Smaller"
            aria-label="Smaller"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={tinyIconButtonClass}
            disabled={locked}
            onClick={() =>
              updateArtworkLayer(layer.id, { scale: layer.scale + 0.05 })
            }
            title="Larger"
            aria-label="Larger"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={tinyIconButtonClass}
            disabled={locked}
            onClick={() =>
              updateArtworkLayer(layer.id, { rotationDeg: layer.rotationDeg - 5 })
            }
            title="Rotate left"
            aria-label="Rotate left"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={tinyIconButtonClass}
            disabled={locked}
            onClick={() =>
              updateArtworkLayer(layer.id, { rotationDeg: layer.rotationDeg + 5 })
            }
            title="Rotate right"
            aria-label="Rotate right"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={`${tinyIconButtonClass} ml-auto`}
            onClick={() => setShowMore((prev) => !prev)}
            title="More options"
            aria-label="More options"
            aria-expanded={showMore}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
        </div>

        {showMore ? (
          <div className="mt-2.5 space-y-2 border-t border-black/10 pt-2.5">
            <select
              value={layer.target}
              onChange={(event) =>
                updateArtworkLayer(layer.id, {
                  target: event.target.value as RashguardArtworkTarget,
                })
              }
              className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-[12px] text-black"
              aria-label="Placement zone"
            >
              {RASHGUARD_ARTWORK_TARGETS.map((target) => (
                <option key={target} value={target}>
                  {RASHGUARD_ARTWORK_TARGET_LABELS[target]}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={tinyIconButtonClass}
                onClick={() => moveArtworkLayer(layer.id, 'up')}
                disabled={index < 0 || index >= artworkLayers.length - 1}
                title="Bring forward"
                aria-label="Bring forward"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={tinyIconButtonClass}
                onClick={() => moveArtworkLayer(layer.id, 'down')}
                disabled={index <= 0}
                title="Send backward"
                aria-label="Send backward"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={tinyIconButtonClass}
                onClick={() =>
                  updateArtworkLayer(layer.id, { locked: !layer.locked })
                }
                title={layer.locked ? 'Unlock' : 'Lock'}
                aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
              >
                {layer.locked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <LockOpen className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                className={tinyIconButtonClass}
                onClick={() => duplicateArtworkLayer(layer.id)}
                title="Duplicate"
                aria-label="Duplicate layer"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={tinyIconButtonClass}
                onClick={() =>
                  updateArtworkLayer(layer.id, { visible: !layer.visible })
                }
                title={layer.visible ? 'Hide' : 'Show'}
                aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
              >
                {layer.visible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                className={`${tinyIconButtonClass} ml-auto text-red-700 hover:bg-red-700`}
                onClick={() => {
                  removeArtworkLayer(layer.id);
                  onClose();
                }}
                title="Delete layer"
                aria-label="Delete layer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);
V2LayerEditor.displayName = 'V2LayerEditor';
