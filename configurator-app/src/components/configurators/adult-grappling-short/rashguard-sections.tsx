import {
  memo,
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
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
} from 'lucide-react';

import { RashguardColorField } from './rashguard-color-picker';
import {
  RASHGUARD_ARTWORK_TARGET_LABELS,
  RASHGUARD_ARTWORK_TARGETS,
  RASHGUARD_COLOR_SWATCHES,
  RASHGUARD_PART_LABELS,
  RASHGUARD_PARTS,
  RASHGUARD_SIZE_OPTIONS,
  nameForHex,
  type RashguardArtworkTarget,
  type RashguardPart,
} from './rashguard-config';
import { useRashguardState, type RashguardArtworkLayer } from './rashguard-state';

function RashguardPartColorSection({
  part,
  value,
  inUseColors,
  onChange,
}: {
  part: RashguardPart;
  value: string;
  inUseColors: string[];
  onChange: (hex: string) => void;
}) {
  const currentName =
    RASHGUARD_COLOR_SWATCHES.find(
      (s) => s.hex.toLowerCase() === value.toLowerCase(),
    )?.name ??
    nameForHex(value) ??
    'Custom';

  return (
    <section className="border-border border-b px-2 py-3">
      <div className="mb-2 flex items-center justify-between gap-2 max-lg:items-start">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="text-foreground text-[12px] font-semibold tracking-wide uppercase">
            {RASHGUARD_PART_LABELS[part]}
          </h3>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground truncate text-[10px] font-medium tracking-wide uppercase">
            {currentName}
          </span>
        </div>
        <RashguardColorField
          value={value}
          label={RASHGUARD_PART_LABELS[part]}
          inUseColors={inUseColors}
          onChange={onChange}
        />
      </div>
      <div className="grid grid-cols-10 justify-start gap-0.5 max-lg:w-full max-lg:gap-1">
        {RASHGUARD_COLOR_SWATCHES.map((swatch) => {
          const isActive = swatch.hex.toLowerCase() === value.toLowerCase();
          const isWhite = swatch.hex.toLowerCase() === '#ffffff';
          return (
            <div
              key={swatch.hex}
              className="w-[1.6875rem] shrink-0 max-lg:w-auto max-lg:min-w-0"
            >
              <button
                type="button"
                onClick={() => onChange(swatch.hex)}
                title={swatch.name}
                aria-label={swatch.name}
                aria-pressed={isActive}
                className={`relative aspect-square w-full rounded-[3px] transition-transform ${
                  isActive && isWhite
                    ? 'border border-black ring-2 ring-[#5c0000] ring-offset-2 ring-offset-white'
                    : isActive
                      ? 'border-white ring-2 ring-[#5c0000] ring-offset-2 ring-offset-white'
                      : isWhite
                        ? 'border-foreground/45 border hover:scale-105'
                        : 'border-border border hover:scale-105'
                }`}
                style={{ backgroundColor: swatch.hex }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export const RashguardGarmentSections = memo(() => {
  const { size, setSize, partColors, setPartColor } = useRashguardState();

  const inUseColors = useMemo(
    () =>
      Array.from(
        new Set(RASHGUARD_PARTS.map((part) => partColors[part].toLowerCase())),
      ),
    [partColors],
  );

  return (
    <>
      <section className="border-border border-b px-3 py-3 max-lg:px-0">
        <div className="mb-2 flex items-baseline gap-2 max-lg:justify-center">
          <h3 className="text-foreground text-[12px] font-semibold tracking-wide uppercase">
            Size
          </h3>
          <span className="text-muted-foreground max-lg:hidden">|</span>
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            {size}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {RASHGUARD_SIZE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSize(option)}
              className={`flex h-8 items-center justify-center rounded-md border text-[11px] font-semibold uppercase transition-colors ${
                option === size
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:border-foreground'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      {RASHGUARD_PARTS.map((part) => (
        <RashguardPartColorSection
          key={part}
          part={part}
          value={partColors[part]}
          inUseColors={inUseColors}
          onChange={(hex) => setPartColor(part, hex)}
        />
      ))}
    </>
  );
});

RashguardGarmentSections.displayName = 'RashguardGarmentSections';

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

const iconButtonClass =
  'flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-muted-foreground shadow-[0_1px_1px_rgba(0,0,0,0.03)] transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35';

const RASHGUARD_TEXT_FONT_OPTIONS = [
  'Arial',
  'Arial Black',
  'Georgia',
  'Impact',
  'Times New Roman',
  'Verdana',
] as const;

function ColorInputRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {disabled ? (
          <div className="flex items-center gap-1 opacity-40">
            <span
              className="h-6 w-7 rounded border border-border p-0.5"
              style={{ backgroundColor: value }}
            />
            <span className="flex h-6 w-20 items-center rounded border border-border bg-background px-1.5 font-mono text-[10px]">
              {value}
            </span>
          </div>
        ) : (
          <RashguardColorField
            value={value}
            label={label}
            inUseColors={[]}
            onChange={onChange}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {RASHGUARD_COLOR_SWATCHES.map((swatch) => (
          <button
            key={`${label}-${swatch.hex}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(swatch.hex)}
            className={`h-5 w-5 rounded border ${
              value.toLowerCase() === swatch.hex.toLowerCase()
                ? 'border-[#5c0000] ring-1 ring-[#5c0000]'
                : 'border-border'
            } disabled:opacity-40`}
            style={{ backgroundColor: swatch.hex }}
            title={swatch.name}
            aria-label={`${label} ${swatch.name}`}
          />
        ))}
      </div>
    </div>
  );
}

function setLayerDragPreview(
  event: ReactDragEvent<HTMLElement>,
  headerEl: HTMLElement,
) {
  const articleEl = headerEl.closest('article');
  const articleRect = articleEl?.getBoundingClientRect();
  const headerRect = headerEl.getBoundingClientRect();
  const preview = document.createElement('div');
  const headerClone = headerEl.cloneNode(true) as HTMLElement;

  preview.style.position = 'fixed';
  preview.style.top = '-1000px';
  preview.style.left = '-1000px';
  preview.style.width = `${articleRect?.width ?? headerRect.width}px`;
  preview.style.boxSizing = 'border-box';
  preview.style.padding = '0.625rem';
  preview.style.border = '1px solid rgba(92, 0, 0, 0.95)';
  preview.style.borderRadius = '1.1rem';
  preview.style.background = 'white';
  preview.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.18)';
  preview.style.opacity = '0.96';
  preview.style.pointerEvents = 'none';
  preview.style.zIndex = '9999';
  headerClone.style.cursor = 'grabbing';
  preview.appendChild(headerClone);
  document.body.appendChild(preview);

  event.dataTransfer.setDragImage(
    preview,
    event.clientX - (articleRect?.left ?? headerRect.left),
    event.clientY - (articleRect?.top ?? headerRect.top),
  );
  window.setTimeout(() => preview.remove(), 0);
}

function ArtworkLayerCard({
  layer,
  orderIndex,
  isSelected,
  canMoveUp,
  canMoveDown,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
}: {
  layer: RashguardArtworkLayer;
  orderIndex: number;
  isSelected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDragEnter: () => void;
}) {
  const {
    updateArtworkLayer,
    duplicateArtworkLayer,
    removeArtworkLayer,
    selectArtworkLayer,
    moveArtworkLayer,
  } = useRashguardState();

  return (
    <article
      className={`rounded-[1.1rem] border bg-background p-2.5 shadow-sm transition-all duration-200 ease-out ${
        isDragging ? 'scale-[1.015] opacity-70 shadow-lg' : 'scale-100 opacity-100'
      } ${
        isSelected
          ? 'border-[#5c0000] ring-1 ring-[#5c0000]'
          : 'border-border/80'
      }`}
      onPointerDown={() => selectArtworkLayer(layer.id)}
      onDragEnd={onDragEnd}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault();
        onDragEnd();
      }}
    >
      <div
        draggable
        className="grid cursor-grab grid-cols-[3.85rem_minmax(0,1fr)_1.2rem] gap-2 active:cursor-grabbing"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.dropEffect = 'move';
          setLayerDragPreview(event, event.currentTarget);
          selectArtworkLayer(null);
          onDragStart();
        }}
      >
        <button
          type="button"
          className="bg-muted/20 h-[3.7rem] w-[3.7rem] shrink-0 overflow-hidden rounded-md border border-border"
          onClick={() => selectArtworkLayer(layer.id)}
          aria-label={`Select ${layer.filename}`}
          title={layer.filename}
        >
          {layer.kind === 'image' && layer.imageUrl ? (
            <img
              src={layer.imageUrl}
              alt=""
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-black"
              style={{
                fontFamily: layer.fontFamily,
                color: layer.color,
                WebkitTextStroke:
                  (layer.outlineWidth ?? 0) > 0
                    ? `1px ${layer.outlineColor ?? '#000000'}`
                    : undefined,
              }}
            >
              {layer.text || 'TEXT'}
            </span>
          )}
        </button>

        <div className="min-w-0 py-0.5">
          <p className="truncate text-[0.82rem] font-bold leading-tight tracking-[0.01em] text-foreground">
            {layer.kind === 'text' ? layer.text || 'Text' : layer.filename}
          </p>
          <div className="mt-1.5 border-t border-border" />
          <div className="mt-2 flex flex-nowrap gap-1">
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => moveArtworkLayer(layer.id, 'up')}
              disabled={!canMoveUp}
              title="Move layer up"
              aria-label="Move layer up"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => moveArtworkLayer(layer.id, 'down')}
              disabled={!canMoveDown}
              title="Move layer down"
              aria-label="Move layer down"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => updateArtworkLayer(layer.id, { locked: !layer.locked })}
              title={layer.locked ? 'Unlock' : 'Lock'}
              aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
            >
              {layer.locked ? (
                <Lock className="h-3 w-3" />
              ) : (
                <LockOpen className="h-3 w-3" />
              )}
            </button>
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => duplicateArtworkLayer(layer.id)}
              title="Duplicate"
              aria-label="Duplicate layer"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              onClick={() =>
                updateArtworkLayer(layer.id, {
                  rotationDeg: layer.rotationDeg - 5,
                })
              }
              title="Rotate left"
              aria-label="Rotate left"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={`${iconButtonClass} text-destructive hover:bg-destructive hover:text-destructive-foreground`}
              onClick={() => removeArtworkLayer(layer.id)}
              title="Delete"
              aria-label="Delete layer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              onClick={(event) => {
                event.stopPropagation();
                updateArtworkLayer(layer.id, { visible: !layer.visible });
              }}
              title={layer.visible ? 'Hide' : 'Show'}
              aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
            >
              {layer.visible ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>

        <span
          className="flex h-full flex-col items-center justify-center text-muted-foreground"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          title="Drag to reorder"
          aria-label="Drag to reorder layer"
        >
          <ArrowUp className="h-3.5 w-3.5" />
          <GripVertical className="-my-1 h-5 w-5" />
          <ArrowDown className="h-3.5 w-3.5" />
        </span>
      </div>

      {isSelected ? (
        <select
          value={layer.target}
          onChange={(event) =>
            updateArtworkLayer(layer.id, {
              target: event.target.value as RashguardArtworkTarget,
            })
          }
          className="mt-2 h-8 w-full rounded border border-border bg-background px-2 text-[11px] font-medium"
        >
          {RASHGUARD_ARTWORK_TARGETS.map((target) => (
            <option key={target} value={target}>
              {RASHGUARD_ARTWORK_TARGET_LABELS[target]}
            </option>
          ))}
        </select>
      ) : null}

      {isSelected ? (
        <div className="mt-3 space-y-2 border-t border-border pt-2">
          {layer.kind === 'text' ? (
            <div className="space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Text
                <input
                  value={layer.text ?? ''}
                  disabled={layer.locked}
                  onChange={(event) =>
                    updateArtworkLayer(layer.id, { text: event.target.value })
                  }
                  className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-[12px] text-foreground"
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Font
                <select
                  value={layer.fontFamily ?? 'Arial'}
                  disabled={layer.locked}
                  onChange={(event) =>
                    updateArtworkLayer(layer.id, {
                      fontFamily: event.target.value,
                    })
                  }
                  className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-[12px] text-foreground"
                >
                  {RASHGUARD_TEXT_FONT_OPTIONS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </label>

              <ColorInputRow
                label="Fill"
                value={layer.color ?? '#ffffff'}
                disabled={layer.locked}
                onChange={(color) => updateArtworkLayer(layer.id, { color })}
              />
              <ColorInputRow
                label="Outline"
                value={layer.outlineColor ?? '#000000'}
                disabled={layer.locked}
                onChange={(outlineColor) =>
                  updateArtworkLayer(layer.id, { outlineColor })
                }
              />
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Outline Width
                <input
                  type="range"
                  min="0"
                  max="36"
                  step="0.5"
                  value={layer.outlineWidth ?? 6}
                  disabled={layer.locked}
                  onChange={(event) =>
                    updateArtworkLayer(layer.id, {
                      outlineWidth: Number(event.target.value),
                    })
                  }
                  className="mt-1 block w-full accent-[#5c0000]"
                />
              </label>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className="flex h-8 items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-wide hover:bg-muted"
              disabled={layer.locked}
              onClick={() => updateArtworkLayer(layer.id, { x: layer.x - 0.025 })}
            >
              <MoveHorizontal className="h-3 w-3" />
              Left
            </button>
            <button
              type="button"
              className="flex h-8 items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-wide hover:bg-muted"
              disabled={layer.locked}
              onClick={() => updateArtworkLayer(layer.id, { x: layer.x + 0.025 })}
            >
              <MoveHorizontal className="h-3 w-3" />
              Right
            </button>
            <button
              type="button"
              className="flex h-8 items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-wide hover:bg-muted"
              disabled={layer.locked}
              onClick={() => updateArtworkLayer(layer.id, { y: layer.y + 0.025 })}
            >
              <MoveVertical className="h-3 w-3" />
              Up
            </button>
            <button
              type="button"
              className="flex h-8 items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-wide hover:bg-muted"
              disabled={layer.locked}
              onClick={() => updateArtworkLayer(layer.id, { y: layer.y - 0.025 })}
            >
              <MoveVertical className="h-3 w-3" />
              Down
            </button>
          </div>

          <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Size
            <input
              type="range"
              min="0.2"
              max="4"
              step="0.025"
              value={layer.scale}
              disabled={layer.locked}
              onChange={(event) =>
                updateArtworkLayer(layer.id, {
                  scale: Number(event.target.value),
                })
              }
              className="mt-1 block w-full accent-[#5c0000]"
            />
          </label>

          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              className={iconButtonClass}
              disabled={layer.locked}
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
              className={iconButtonClass}
              disabled={layer.locked}
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
              className={iconButtonClass}
              disabled={layer.locked}
              onClick={() =>
                updateArtworkLayer(layer.id, {
                  rotationDeg: layer.rotationDeg - 5,
                })
              }
              title="Rotate left"
              aria-label="Rotate left"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              disabled={layer.locked}
              onClick={() =>
                updateArtworkLayer(layer.id, {
                  rotationDeg: layer.rotationDeg + 5,
                })
              }
              title="Rotate right"
              aria-label="Rotate right"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Rotation
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={layer.rotationDeg}
              disabled={layer.locked}
              onChange={(event) =>
                updateArtworkLayer(layer.id, {
                  rotationDeg: Number(event.target.value),
                })
              }
              className="mt-1 block w-full accent-[#5c0000]"
            />
          </label>
        </div>
      ) : null}
    </article>
  );
}

function RashguardLayerList() {
  const {
    artworkLayers,
    selectedArtworkLayerId,
    reorderArtworkLayer,
  } = useRashguardState();
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);

  const layerRows = useMemo(
    () =>
      artworkLayers
        .map((layer, index) => ({ layer, index }))
        .reverse(),
    [artworkLayers],
  );

  return (
    <section className="space-y-2 px-3 py-3">
      <h3 className="text-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
        Layers
      </h3>
      {layerRows.length > 0 ? (
        layerRows.map(({ layer, index }) => (
          <div
            key={layer.id}
            className={`transition-all duration-200 ease-out ${
              dragOverLayerId === layer.id && draggedLayerId !== layer.id
                ? 'py-1'
                : 'py-0'
            }`}
          >
            <ArtworkLayerCard
              layer={layer}
              orderIndex={index + 1}
              isSelected={selectedArtworkLayerId === layer.id}
              canMoveUp={index < artworkLayers.length - 1}
              canMoveDown={index > 0}
              isDragging={draggedLayerId === layer.id}
              onDragStart={() => {
                setDraggedLayerId(layer.id);
                setDragOverLayerId(layer.id);
              }}
              onDragEnd={() => {
                setDraggedLayerId(null);
                setDragOverLayerId(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDragEnter={() => {
                if (!draggedLayerId || draggedLayerId === layer.id) return;
                setDragOverLayerId(layer.id);
                reorderArtworkLayer(draggedLayerId, index);
              }}
            />
          </div>
        ))
      ) : (
        <div className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-[11px]">
          No layers
        </div>
      )}
    </section>
  );
}

export const RashguardArtworkSections = memo(() => {
  const {
    addArtworkLayer,
    addTextLayer,
    cameraView,
  } = useRashguardState();
  const [isDragActive, setIsDragActive] = useState(false);

  const defaultTarget = cameraView === 'back' ? 'rightBackLeg' : 'rightFrontLeg';

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files).find((candidate) =>
        ['image/png', 'image/jpeg'].includes(candidate.type),
      );
      if (!file) return;
      const result = await trimTransparentPadding(file);
      addArtworkLayer({
        file: result.file,
        dimensions: result.dimensions,
        target: defaultTarget,
      });
    },
    [addArtworkLayer, defaultTarget],
  );

  const handleInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) await handleFiles(event.target.files);
      event.target.value = '';
    },
    [handleFiles],
  );

  const handleDrag = useCallback((event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDragEnter = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      handleDrag(event);
      if (event.dataTransfer.types.includes('Files')) setIsDragActive(true);
    },
    [handleDrag],
  );

  const handleDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      handleDrag(event);
      const nextTarget = event.relatedTarget;
      if (nextTarget && event.currentTarget.contains(nextTarget as Node)) return;
      setIsDragActive(false);
    },
    [handleDrag],
  );

  const handleDrop = useCallback(
    async (event: ReactDragEvent<HTMLElement>) => {
      handleDrag(event);
      setIsDragActive(false);
      await handleFiles(event.dataTransfer.files);
    },
    [handleDrag, handleFiles],
  );

  return (
    <>
      <section className="border-border border-b px-3 py-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <h3 className="text-foreground mb-2 text-[10px] font-semibold tracking-[0.14em] uppercase">
              Image
            </h3>
            <label
              className={`group relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border bg-gradient-to-b transition-all ${
                isDragActive
                  ? 'border-foreground/40 from-primary/5 to-primary/10 shadow-md'
                  : 'border-border from-muted/30 to-muted/10 hover:border-foreground/30 hover:from-muted/40 hover:to-muted/20'
              }`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDrag}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={handleInputChange}
                aria-label="Upload image"
              />
              <span className="bg-background text-muted-foreground group-hover:text-foreground flex h-9 w-9 items-center justify-center rounded-full border">
                <ImagePlus className="h-4 w-4" />
              </span>
              <span className="text-foreground text-center text-[11px] font-semibold uppercase tracking-wide">
                Upload Image
              </span>
            </label>
          </div>

          <div>
            <h3 className="text-foreground mb-2 text-[10px] font-semibold tracking-[0.14em] uppercase">
              Text
            </h3>
            <button
              type="button"
              onClick={() => addTextLayer({ target: defaultTarget })}
              className="group relative flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-gradient-to-b from-muted/30 to-muted/10 transition-all hover:border-foreground/30 hover:from-muted/40 hover:to-muted/20"
            >
              <span className="bg-background text-muted-foreground group-hover:text-foreground flex h-9 w-9 items-center justify-center rounded-full border">
                <Type className="h-4 w-4" />
              </span>
              <span className="text-foreground text-center text-[11px] font-semibold uppercase tracking-wide">
                Add Text
              </span>
            </button>
          </div>
        </div>
      </section>

      <RashguardLayerList />
    </>
  );
});

RashguardArtworkSections.displayName = 'RashguardArtworkSections';

export const RashguardTextSections = memo(() => {
  const {
    artworkLayers,
    selectedArtworkLayerId,
    addTextLayer,
    updateArtworkLayer,
  } = useRashguardState();
  const selectedTextLayer = artworkLayers.find(
    (layer) => layer.id === selectedArtworkLayerId && layer.kind === 'text',
  );

  return (
    <>
      <section className="border-border border-b px-3 py-3">
        <h3 className="text-foreground mb-2 text-[10px] font-semibold tracking-[0.14em] uppercase">
          Text
        </h3>
        <button
          type="button"
          onClick={() => addTextLayer()}
          className="group relative flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-gradient-to-b from-muted/30 to-muted/10 transition-all hover:border-foreground/30 hover:from-muted/40 hover:to-muted/20"
        >
          <span className="bg-background text-muted-foreground group-hover:text-foreground flex h-9 w-9 items-center justify-center rounded-full border">
            <Type className="h-4 w-4" />
          </span>
          <span className="text-foreground text-[11px] font-semibold uppercase tracking-wide">
            Add Text
          </span>
        </button>
        {selectedTextLayer ? (
          <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Text
              <input
                value={selectedTextLayer.text ?? ''}
                disabled={selectedTextLayer.locked}
                onChange={(event) =>
                  updateArtworkLayer(selectedTextLayer.id, {
                    text: event.target.value,
                  })
                }
                className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-[12px] text-foreground"
              />
            </label>
          </div>
        ) : null}
      </section>

      <RashguardLayerList />
    </>
  );
});

RashguardTextSections.displayName = 'RashguardTextSections';
