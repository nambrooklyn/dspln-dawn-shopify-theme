import {
  memo,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';

import {
  BELT_COLOR_SWATCHES,
  BELT_FONT_OPTIONS,
  GI_COLOR_SWATCHES,
  GI_PART_PRICES,
  nameForBeltHex,
  nameForHex,
} from '../gi/gi-config';
import { useGiState } from '../gi/gi-state';
import { useSavedUploads } from '../gi/uploaded-logos-context';
import type { UploadedLogoItem } from '../gi/use-uploaded-logos';
import {
  BASE_SIZES,
  CUSTOM_MEASUREMENTS,
  SIZE_OPTIONS,
} from '../shared/part-sections/size-options';

/* ---------------------------------------------------------------- shared -- */

// Real glass: low fill + heavy blur. Note the translucency only READS when
// something non-white is behind it — over the white gi it still looks white.
const panelCardClass =
  'pointer-events-auto rounded-2xl border border-white/30 bg-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.14)] backdrop-blur-2xl backdrop-saturate-150';

const pillButtonClass =
  'pointer-events-auto flex h-10 items-center justify-center gap-2 rounded-full border border-white/30 bg-white/15 px-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-black shadow-[0_2px_10px_rgba(0,0,0,0.07)] backdrop-blur-2xl backdrop-saturate-150 transition hover:bg-black hover:text-white';

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

function PanelHeader({
  title,
  detail,
  onClose,
}: {
  title: string;
  detail?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-[11px] font-bold tracking-[0.12em] whitespace-nowrap text-black uppercase">
          {title}
        </span>
        {detail ? (
          <span className="truncate text-[10px] font-medium uppercase tracking-wide text-black/45">
            {detail}
          </span>
        ) : null}
      </div>
      <PanelClose onClose={onClose} />
    </div>
  );
}

interface SwatchOption {
  name: string;
  hex: string;
}

function SwatchGrid({
  swatches,
  value,
  onChange,
  columns = 5,
}: {
  swatches: readonly SwatchOption[];
  value: string;
  onChange: (hex: string) => void;
  columns?: number;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {swatches.map((swatch) => {
        const isActive = swatch.hex.toLowerCase() === value.toLowerCase();
        const isWhite = swatch.hex.toLowerCase() === '#ffffff';
        return (
          <button
            key={swatch.hex}
            type="button"
            title={swatch.name}
            aria-label={swatch.name}
            aria-pressed={isActive}
            onClick={() => onChange(swatch.hex)}
            className={`h-[22px] w-[22px] rounded-[4px] transition-transform ${
              isActive
                ? 'ring-2 ring-[#5c0000] ring-offset-1 ring-offset-white'
                : 'hover:scale-125'
            } ${isWhite ? 'border border-black/30' : 'border border-black/10'}`}
            style={{ backgroundColor: swatch.hex }}
          />
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- color panel -- */

export const GiV2ColorPanel = memo(
  ({
    title,
    value,
    swatches,
    onChange,
    onClose,
  }: {
    title: string;
    value: string;
    swatches: readonly SwatchOption[];
    onChange: (hex: string) => void;
    onClose: () => void;
  }) => {
    const currentName =
      swatches.find((s) => s.hex.toLowerCase() === value.toLowerCase())?.name ??
      nameForHex(value) ??
      nameForBeltHex(value) ??
      'Custom';

    return (
      <div className={`${panelCardClass} px-4 py-3`}>
        <PanelHeader title={title} detail={currentName} onClose={onClose} />
        <SwatchGrid swatches={swatches} value={value} onChange={onChange} />
      </div>
    );
  },
);
GiV2ColorPanel.displayName = 'GiV2ColorPanel';

/* ------------------------------------------------------------ logo panel -- */

function loadImageDimensions(file: File) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export const GiV2LogoPanel = memo(
  ({
    label,
    imageUrl,
    filename,
    onUpload,
    onApplyExisting,
    onRemove,
    onClose,
  }: {
    label: string;
    imageUrl?: string;
    filename?: string;
    onUpload: (
      file: File,
      dimensions: { width: number; height: number },
    ) => void;
    /** Apply a previously uploaded artwork (from the customer's library). */
    onApplyExisting?: (item: UploadedLogoItem) => void;
    onRemove: () => void;
    onClose: () => void;
  }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const savedUploads = useSavedUploads();
    // Don't offer the artwork that's already ON this slot.
    const reusableUploads = savedUploads.filter(
      (item) => item.url !== imageUrl,
    );

    const handleInputChange = useCallback(
      async (event: ChangeEvent<HTMLInputElement>) => {
        const file = Array.from(event.target.files ?? []).find((candidate) =>
          ['image/png', 'image/jpeg', 'image/svg+xml'].includes(candidate.type),
        );
        event.target.value = '';
        if (!file) return;
        const dimensions = await loadImageDimensions(file);
        if (!dimensions) return;
        onUpload(file, dimensions);
      },
      [onUpload],
    );

    return (
      <div className={`${panelCardClass} px-4 py-3`}>
        {/* No filename detail — the thumbnail already shows what's placed
            and long machine names ballooned the panel. */}
        <PanelHeader title={label} onClose={onClose} />
        <div className="flex items-center gap-2">
          {imageUrl ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-black/5 p-1">
              <img
                src={imageUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            // fontSize inline: the app's `font: inherit` reset on buttons
            // overrides Tailwind text utilities.
            style={{ fontSize: '10px' }}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white/80 px-3 font-medium whitespace-nowrap text-black shadow-[0_1px_4px_rgba(0,0,0,0.1)] transition hover:bg-black hover:text-white"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {imageUrl ? 'Replace Logo' : 'Upload Logo'}
          </button>
          {imageUrl ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove logo"
              title="Remove logo"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-red-700 shadow-[0_1px_4px_rgba(0,0,0,0.1)] transition hover:bg-red-700 hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {onApplyExisting && reusableUploads.length > 0 ? (
          <div className="mt-2.5">
            <p className="mb-1.5 text-[9px] font-semibold tracking-[0.12em] text-black/45 uppercase">
              Your uploads
            </p>
            <div className="flex max-w-56 flex-wrap gap-1.5">
              {reusableUploads.slice(0, 8).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  title={`${item.filename} — tap to place here`}
                  aria-label={`Place ${item.filename} here`}
                  onClick={() => onApplyExisting(item)}
                  className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-white/80 p-1 transition hover:border-black hover:bg-white"
                >
                  <img
                    src={item.url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    draggable={false}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={handleInputChange}
          aria-label={`Upload ${label}`}
        />
      </div>
    );
  },
);
GiV2LogoPanel.displayName = 'GiV2LogoPanel';

/* -------------------------------------------------------- belt-end panel -- */

export const GiV2BeltEndPanel = memo(
  ({ end, onClose }: { end: 'left' | 'right'; onClose: () => void }) => {
    const { beltEmbroidery, setBeltEmbroidery } = useGiState();
    const text = end === 'left' ? beltEmbroidery.leftEnd : beltEmbroidery.rightEnd;
    const font =
      end === 'left' ? beltEmbroidery.leftFont : beltEmbroidery.rightFont;
    const threadColor =
      end === 'left'
        ? beltEmbroidery.leftThreadColor
        : beltEmbroidery.rightThreadColor;

    return (
      <div className={`${panelCardClass} w-[19rem] max-w-[calc(100vw-1.5rem)] px-4 py-3`}>
        <PanelHeader
          title={`${end === 'left' ? 'Left' : 'Right'} Belt End`}
          detail={text.trim() || 'No text'}
          onClose={onClose}
        />
        <div className="space-y-2">
          <div className="relative">
            <input
              value={text}
              maxLength={18}
              placeholder="TEXT HERE"
              onChange={(event) =>
                setBeltEmbroidery(
                  end === 'left'
                    ? { leftEnd: event.target.value.toUpperCase() }
                    : { rightEnd: event.target.value.toUpperCase() },
                )
              }
              className="h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 pr-11 text-[13px] text-black placeholder:text-black/25"
              aria-label="Embroidery text"
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[9px] text-black/35">
              {text.length}/18
            </span>
          </div>
          <select
            value={font}
            onChange={(event) =>
              setBeltEmbroidery(
                end === 'left'
                  ? { leftFont: event.target.value }
                  : { rightFont: event.target.value },
              )
            }
            className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-[12px] text-black"
            aria-label="Embroidery font"
          >
            {BELT_FONT_OPTIONS.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>
          <div>
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/45">
              Thread Color
            </span>
            <SwatchGrid
              swatches={GI_COLOR_SWATCHES}
              value={threadColor}
              onChange={(hex) =>
                setBeltEmbroidery(
                  end === 'left'
                    ? { leftThreadColor: hex }
                    : { rightThreadColor: hex },
                )
              }
            />
          </div>
        </div>
      </div>
    );
  },
);
GiV2BeltEndPanel.displayName = 'GiV2BeltEndPanel';

/* ------------------------------------------------------ sizes & parts ---- */

const PART_ROWS = [
  { part: 'jacket' as const, label: 'Kimono', sizes: SIZE_OPTIONS },
  { part: 'pants' as const, label: 'Pant', sizes: SIZE_OPTIONS },
  { part: 'belt' as const, label: 'Belt', sizes: [...BASE_SIZES] },
];

/**
 * One quiet pill top-right expanding to the full sizes + add/remove card —
 * the only place part inclusion is toggled, so removed parts (whose hotspots
 * disappear) can always be added back.
 */
export const GiV2OptionsPill = memo(() => {
  const {
    partVisibility,
    setPartVisible,
    kimonoSize,
    setKimonoSize,
    pantSize,
    setPantSize,
    beltSize,
    setBeltSize,
    customSizeNotes,
    setCustomSizeNotes,
  } = useGiState();
  const [open, setOpen] = useState(false);

  const sizeFor = (part: 'jacket' | 'pants' | 'belt') =>
    part === 'jacket' ? kimonoSize : part === 'pants' ? pantSize : beltSize;
  const setSizeFor = (part: 'jacket' | 'pants' | 'belt', size: string) => {
    if (part === 'jacket') setKimonoSize(size);
    else if (part === 'pants') setPantSize(size);
    else setBeltSize(size);
  };

  const hasCustomSizing =
    (partVisibility.jacket && kimonoSize === CUSTOM_MEASUREMENTS) ||
    (partVisibility.pants && pantSize === CUSTOM_MEASUREMENTS);

  // Only show picked sizes in the pill label ("Sizes · A2 · A2L"); an
  // all-empty state stays a clean "Sizes".
  const summary = PART_ROWS.filter(
    ({ part }) => partVisibility[part] && sizeFor(part),
  )
    .map(({ part }) => sizeFor(part))
    .join(' · ');

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={pillButtonClass}
        aria-expanded={open}
      >
        Sizes{summary ? ` · ${summary}` : ''}
      </button>
      {open ? (
        <div className={`${panelCardClass} w-[19rem] max-w-[calc(100vw-1.5rem)] px-4 py-3`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-black">
              Sizes &amp; Parts
            </span>
            <PanelClose onClose={() => setOpen(false)} />
          </div>
          <div className="space-y-2.5">
            {PART_ROWS.map(({ part, label, sizes }) => {
              const included = partVisibility[part];
              return (
                <div key={part}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/60">
                      {label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPartVisible(part, !included)}
                      className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] transition ${
                        included
                          ? 'text-black/40 hover:bg-black/5 hover:text-black'
                          : 'bg-black text-white hover:bg-black/80'
                      }`}
                    >
                      {included
                        ? 'Remove'
                        : `Add +$${GI_PART_PRICES[part]}`}
                    </button>
                  </div>
                  {included ? (
                    <select
                      value={sizeFor(part)}
                      onChange={(event) => setSizeFor(part, event.target.value)}
                      className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-[12px] text-black"
                      aria-label={`${label} size`}
                    >
                      <option value="" disabled>
                        Select size…
                      </option>
                      {sizes.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[10px] text-black/35">
                      Not included in this order.
                    </p>
                  )}
                </div>
              );
            })}
            {hasCustomSizing ? (
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-black/60">
                  Custom Measurements (+$25)
                </span>
                <textarea
                  value={customSizeNotes}
                  onChange={(event) => setCustomSizeNotes(event.target.value)}
                  placeholder="Height, weight, and any measurements…"
                  rows={3}
                  className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-[12px] text-black placeholder:text-black/25"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});
GiV2OptionsPill.displayName = 'GiV2OptionsPill';
