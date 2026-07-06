import {
  memo,
  useCallback,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  Copy,
  ImageIcon,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Plus,
  Replace,
  RotateCcw,
  RotateCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';

interface LogoTransformControls {
  offsetXIn: number;
  offsetYIn: number;
  scale: number;
  rotationDeg: number;
}

interface SectionLogoUploadProps {
  /** Section title (e.g. "Logo on Left Sleeve"). */
  title: string;
  /** Optional visible add-on price, shown beside the section title. */
  priceLabel?: string;
  /** Current uploaded image URL — empty/undefined means no logo placed. */
  imageUrl?: string;
  /** Original filename. */
  filename?: string;
  transform?: LogoTransformControls;
  onUpload: (file: File, dimensions: { width: number; height: number }) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  onTransformChange?: (transform: Partial<LogoTransformControls>) => void;
}

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

    if (!img) {
      return { file, dimensions: { width: 0, height: 0 } };
    }

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
    const alphaThreshold = 8;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha <= alphaThreshold) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
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

    const trimmedFile = new File([blob], file.name, { type: 'image/png' });
    return {
      file: trimmedFile,
      dimensions: { width: cropWidth, height: cropHeight },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Modern logo-upload section. Empty state is a soft card with a cloud
 * icon, on hover/drag it lifts and brightens. Filled state shows the
 * logo on a tiled-checker background (so transparency is obvious) with
 * a hover overlay surfacing "Replace" and "Remove" actions.
 */
export const SectionLogoUpload = memo(
  ({
    title,
    priceLabel,
    imageUrl,
    filename,
    transform,
    onUpload,
    onRemove,
    onDuplicate,
    onTransformChange,
  }: SectionLogoUploadProps) => {
    const [isHovering, setIsHovering] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);

    const handleFiles = useCallback(
      async (files: FileList | File[]) => {
        const file = Array.from(files).find((candidate) =>
          ['image/png', 'image/jpeg'].includes(candidate.type),
        );
        if (!file) return;
        const result = await trimTransparentPadding(file);
        onUpload(result.file, result.dimensions);
      },
      [onUpload],
    );

    const handleInputChange = useCallback(
      async (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
          await handleFiles(event.target.files);
        }
        event.target.value = '';
      },
      [handleFiles],
    );

    const handleDragEnter = useCallback(
      (event: ReactDragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.types.includes('Files')) {
          setIsDragActive(true);
        }
      },
      [],
    );

    const handleDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      setIsDragActive(true);
    }, []);

    const handleDragLeave = useCallback(
      (event: ReactDragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const nextTarget = event.relatedTarget;
        if (nextTarget && event.currentTarget.contains(nextTarget as Node)) {
          return;
        }
        setIsDragActive(false);
      },
      [],
    );

    const handleDrop = useCallback(
      async (event: ReactDragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragActive(false);
        await handleFiles(event.dataTransfer.files);
      },
      [handleFiles],
    );

    const currentTransform = transform ?? {
      offsetXIn: 0,
      offsetYIn: 0,
      scale: 1,
      rotationDeg: 0,
    };

    return (
      <section className="border-border border-b px-3 py-3">
        <h3 className="text-foreground mb-2 flex items-baseline justify-between gap-2 text-[10px] font-semibold tracking-[0.14em] uppercase max-lg:hidden">
          <span className="min-w-0 truncate">{title}</span>
          {priceLabel ? (
            <span className="text-muted-foreground shrink-0 tracking-[0.08em]">
              {priceLabel}
            </span>
          ) : null}
        </h3>

        {imageUrl ? (
          // ─── FILLED STATE ───────────────────────────────────────────
          <div
                className={`group ring-border bg-muted/30 relative aspect-[5/3] overflow-hidden rounded-lg shadow-sm ring-1 transition-shadow hover:shadow-md ${
              isDragActive ? 'ring-foreground/40 scale-[1.01]' : ''
            }`}
            style={{
              backgroundImage:
                'linear-gradient(45deg, #f3f4f6 25%, transparent 25%), linear-gradient(-45deg, #f3f4f6 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f3f4f6 75%), linear-gradient(-45deg, transparent 75%, #f3f4f6 75%)',
              backgroundSize: '14px 14px',
              backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0px',
            }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
              }}
              aria-label={filename ?? 'uploaded logo'}
            />
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              onChange={handleInputChange}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              aria-label={`Replace ${title}`}
            />
            {/* Hover overlay with Replace / Remove */}
            <div
              className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2 bg-black/40 backdrop-blur-sm transition-opacity ${
                isHovering || isDragActive ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {isDragActive ? (
                <span className="bg-background text-foreground rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm">
                  Drop to upload
                </span>
              ) : (
                <>
                  <span className="bg-background text-foreground flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm">
                    <Replace className="h-3.5 w-3.5" />
                    Replace
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove();
                    }}
                    aria-label="Remove logo"
                    className="bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground pointer-events-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          // ─── EMPTY STATE ────────────────────────────────────────────
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group relative flex aspect-[5/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border bg-gradient-to-b transition-all ${
              isDragActive
                ? 'border-foreground/40 from-primary/5 to-primary/10 scale-[1.01] shadow-md'
                : 'border-border from-muted/30 to-muted/10 hover:border-foreground/30 hover:from-muted/40 hover:to-muted/20 hover:shadow-sm'
            }`}
          >
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              onChange={handleInputChange}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              aria-label={`Upload ${title}`}
            />
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                isDragActive
                  ? 'bg-foreground/10 text-foreground'
                  : 'bg-background text-muted-foreground group-hover:text-foreground border'
              }`}
            >
              {isDragActive ? (
                <ImageIcon className="h-3.5 w-3.5" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5" />
              )}
            </div>
            <p className="text-foreground text-[11px] font-medium">
              {isDragActive ? 'Drop to upload' : 'Click or drag to upload'}
            </p>
            <p className="text-muted-foreground text-[9px] tracking-wide">
              PNG / JPG · max 50&nbsp;MB
            </p>
          </div>
        )}

        {filename && imageUrl ? (
          <>
            <div className="mt-2 flex items-center gap-1.5">
              <p
                className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]"
                title={filename}
              >
                {filename}
              </p>
              {onDuplicate ? (
                <button
                  type="button"
                  onClick={onDuplicate}
                  className="border-border hover:bg-muted flex h-7 w-7 items-center justify-center rounded border text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Duplicate ${title}`}
                  title="Duplicate"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {onTransformChange ? (
              <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onTransformChange({
                        offsetXIn: currentTransform.offsetXIn - 0.25,
                      })
                    }
                    className="flex h-8 items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-wide hover:bg-muted"
                    title="Move left"
                  >
                    <MoveHorizontal className="h-3 w-3" />
                    Left
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTransformChange({
                        offsetXIn: currentTransform.offsetXIn + 0.25,
                      })
                    }
                    className="flex h-8 items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-wide hover:bg-muted"
                    title="Move right"
                  >
                    <MoveHorizontal className="h-3 w-3" />
                    Right
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTransformChange({
                        offsetYIn: currentTransform.offsetYIn + 0.25,
                      })
                    }
                    className="flex h-8 items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-wide hover:bg-muted"
                    title="Move up"
                  >
                    <MoveVertical className="h-3 w-3" />
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTransformChange({
                        offsetYIn: currentTransform.offsetYIn - 0.25,
                      })
                    }
                    className="flex h-8 items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-wide hover:bg-muted"
                    title="Move down"
                  >
                    <MoveVertical className="h-3 w-3" />
                    Down
                  </button>
                </div>

                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Size
                  <input
                    type="range"
                    min="0.35"
                    max="2.25"
                    step="0.05"
                    value={currentTransform.scale}
                    onChange={(event) =>
                      onTransformChange({ scale: Number(event.target.value) })
                    }
                    className="mt-1 block w-full accent-[#5c0000]"
                  />
                </label>

                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onTransformChange({
                        scale: Math.max(0.35, currentTransform.scale - 0.1),
                      })
                    }
                    className="flex h-8 items-center justify-center rounded border hover:bg-muted"
                    title="Smaller"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTransformChange({
                        scale: Math.min(2.25, currentTransform.scale + 0.1),
                      })
                    }
                    className="flex h-8 items-center justify-center rounded border hover:bg-muted"
                    title="Larger"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTransformChange({
                        rotationDeg: currentTransform.rotationDeg - 5,
                      })
                    }
                    className="flex h-8 items-center justify-center rounded border hover:bg-muted"
                    title="Rotate left"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTransformChange({
                        rotationDeg: currentTransform.rotationDeg + 5,
                      })
                    }
                    className="flex h-8 items-center justify-center rounded border hover:bg-muted"
                    title="Rotate right"
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
                    value={currentTransform.rotationDeg}
                    onChange={(event) =>
                      onTransformChange({
                        rotationDeg: Number(event.target.value),
                      })
                    }
                    className="mt-1 block w-full accent-[#5c0000]"
                  />
                </label>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    );
  },
);

SectionLogoUpload.displayName = 'SectionLogoUpload';
