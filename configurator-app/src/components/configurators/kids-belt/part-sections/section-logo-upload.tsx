import {
  memo,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { ImageIcon, Replace, Trash2, UploadCloud } from 'lucide-react';

import { useSavedUploads } from '../uploaded-logos-context';
import type { UploadedLogoItem } from '../use-uploaded-logos';

interface SectionLogoUploadProps {
  /** Section title (e.g. "Logo on Left Sleeve"). */
  title: string;
  /** Optional visible add-on price, shown beside the section title. */
  priceLabel?: string;
  /** Current uploaded image URL — empty/undefined means no logo placed. */
  imageUrl?: string;
  /** Original filename. */
  filename?: string;
  onUpload: (file: File, dimensions: { width: number; height: number }) => void;
  onRemove: () => void;
  /** Called when the merchant starts interacting with this slot. */
  onActivate?: () => void;
  /** Apply an already-uploaded artwork to this slot. When provided and
   *  the customer has uploads, clicking the slot opens a chooser
   *  (device tile + upload thumbnails) instead of the bare file picker. */
  onApplyExisting?: (item: UploadedLogoItem) => void;
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
    onUpload,
    onRemove,
    onActivate,
    onApplyExisting,
  }: SectionLogoUploadProps) => {
    const [isHovering, setIsHovering] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);
    const [chooserOpen, setChooserOpen] = useState(false);
    const chooserFileRef = useRef<HTMLInputElement>(null);
    const savedUploads = useSavedUploads();
    const chooserEnabled = Boolean(onApplyExisting) && savedUploads.length > 0;

    // With uploads available, a click opens the chooser instead of the
    // native picker; drag-and-drop still uploads directly.
    const handleSlotClick = useCallback(
      (event: ReactMouseEvent<HTMLInputElement>) => {
        onActivate?.();
        if (!chooserEnabled) return;
        event.preventDefault();
        setChooserOpen((open) => !open);
      },
      [chooserEnabled, onActivate],
    );

    const applyExisting = useCallback(
      (item: UploadedLogoItem) => {
        onApplyExisting?.(item);
        setChooserOpen(false);
      },
      [onApplyExisting],
    );

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
              onClick={handleSlotClick}
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
                  {/* Clickable only while the overlay is visible: with a
                      static pointer-events-auto this button sat invisible
                      (opacity-0) over the tile center and swallowed replace
                      clicks/taps as silent logo deletions (no hover on touch). */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove();
                    }}
                    aria-label="Remove logo"
                    className={`bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${
                      isHovering ? 'pointer-events-auto' : 'pointer-events-none'
                    }`}
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
              onClick={handleSlotClick}
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

        {chooserOpen && chooserEnabled ? (
          <div className="border-border bg-background mt-2 rounded-lg border p-2 shadow-sm">
            <div className="grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto">
              <button
                type="button"
                onClick={() => chooserFileRef.current?.click()}
                className="border-foreground/30 text-muted-foreground hover:border-foreground/60 hover:text-foreground flex aspect-square w-full flex-col items-center justify-center gap-1 rounded border border-dashed"
              >
                <UploadCloud className="h-4 w-4" />
                <span className="text-[10px]">Device</span>
              </button>
              {savedUploads.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-label="Apply this artwork"
                  onClick={() => applyExisting(item)}
                  className="border-border bg-muted/60 hover:ring-foreground/40 flex aspect-square w-full items-center justify-center overflow-hidden rounded border p-1 hover:ring-2"
                >
                  <img
                    src={item.url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </button>
              ))}
            </div>
            <input
              ref={chooserFileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={async (event) => {
                if (event.target.files) {
                  await handleFiles(event.target.files);
                }
                event.target.value = '';
                setChooserOpen(false);
              }}
            />
          </div>
        ) : null}

        {filename && imageUrl ? (
          <p
            className="text-muted-foreground mt-2 truncate text-[11px]"
            title={filename}
          >
            {filename}
          </p>
        ) : null}
      </section>
    );
  },
);

SectionLogoUpload.displayName = 'SectionLogoUpload';
