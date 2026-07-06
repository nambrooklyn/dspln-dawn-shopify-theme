import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Grid2x2, Pipette, SlidersHorizontal } from 'lucide-react';

/**
 * Custom in-app colour picker for the Texture Stitch Rashguard 2.0 configurator.
 *
 * Replaces the native `<input type="color">` (whose popup is drawn by the
 * browser/OS, so it looks different in Safari vs Chrome). This one is rendered
 * by us, so it's identical on every browser and on-brand. It offers TWO modes
 * the user can toggle between — a Spectrum picker (gradient + hue + RGB, like
 * Chrome's) and a Palette grid (swatch grid, like macOS') — plus rows of the
 * colours currently in use on the garment and recently picked colours.
 */

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function isHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function normalizeHex(value: string) {
  const t = value.trim();
  return t.startsWith('#') ? t : `#${t}`;
}

function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }: Rgb) {
  return (
    '#' +
    [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')
  );
}

function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function hsvToHex(hsv: Hsv) {
  return rgbToHex(hsvToRgb(hsv));
}

// ---------------------------------------------------------------------------
// Recent colours (persisted) + shared picker-mode preference
// ---------------------------------------------------------------------------

const RECENT_KEY = 'dspln:rashguard-recent-colors';
const MODE_KEY = 'dspln:rashguard-colorpicker-mode';
const MAX_RECENT = 12;

function readRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((c): c is string => typeof c === 'string' && isHex(c))
      : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function pushRecentColor(hex: string) {
  if (!isHex(hex)) return;
  const lower = hex.toLowerCase();
  const next = [lower, ...readRecent().filter((c) => c !== lower)].slice(
    0,
    MAX_RECENT,
  );
  writeRecent(next);
  window.dispatchEvent(new Event('dspln:rashguard-recent-colors-changed'));
}

function useRecentColors() {
  const [recent, setRecent] = useState<string[]>(readRecent);
  useEffect(() => {
    const sync = () => setRecent(readRecent());
    window.addEventListener('dspln:rashguard-recent-colors-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('dspln:rashguard-recent-colors-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return recent;
}

type PickerMode = 'spectrum' | 'palette';

function readMode(): PickerMode {
  if (typeof window === 'undefined') return 'spectrum';
  return window.localStorage.getItem(MODE_KEY) === 'palette'
    ? 'palette'
    : 'spectrum';
}

// ---------------------------------------------------------------------------
// Palette grid (generated once) — grayscale row + hue × shade grid
// ---------------------------------------------------------------------------

const PALETTE_ROWS: string[][] = (() => {
  const hues = Array.from({ length: 12 }, (_, i) => i * 30);
  const shades: Hsv[] = [
    { h: 0, s: 0.18, v: 1 },
    { h: 0, s: 0.4, v: 1 },
    { h: 0, s: 0.65, v: 1 },
    { h: 0, s: 1, v: 1 },
    { h: 0, s: 1, v: 0.82 },
    { h: 0, s: 1, v: 0.64 },
    { h: 0, s: 1, v: 0.46 },
    { h: 0, s: 1, v: 0.3 },
  ];
  const gray = Array.from({ length: 12 }, (_, i) =>
    rgbToHex(hsvToRgb({ h: 0, s: 0, v: 1 - i / 11 })),
  );
  const grid = shades.map((shade) =>
    hues.map((h) => hsvToHex({ ...shade, h })),
  );
  return [gray, ...grid];
})();

// ---------------------------------------------------------------------------
// Small reusable swatch
// ---------------------------------------------------------------------------

const Swatch = memo(
  ({
    hex,
    active,
    size = 18,
    title,
    onPick,
  }: {
    hex: string;
    active?: boolean;
    size?: number;
    title?: string;
    onPick: (hex: string) => void;
  }) => {
    const isWhite = hex.toLowerCase() === '#ffffff';
    return (
      <button
        type="button"
        title={title ?? hex}
        aria-label={title ?? hex}
        onClick={() => onPick(hex)}
        className={`shrink-0 rounded-[3px] transition-transform hover:scale-110 ${
          active
            ? 'ring-2 ring-[#5c0000] ring-offset-1 ring-offset-white'
            : isWhite
              ? 'border border-foreground/40'
              : 'border border-black/10'
        }`}
        style={{ width: size, height: size, backgroundColor: hex }}
      />
    );
  },
);
Swatch.displayName = 'RashguardColorSwatch';

// ---------------------------------------------------------------------------
// Spectrum mode: saturation/value square + hue slider + hex/RGB + eyedropper
// ---------------------------------------------------------------------------

const hasEyeDropper =
  typeof window !== 'undefined' && 'EyeDropper' in window;

function useDrag(onMove: (clientX: number, clientY: number) => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const start = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current;
    if (el) el.setPointerCapture(e.pointerId);
    onMoveRef.current(e.clientX, e.clientY);
  }, []);

  const move = useCallback((e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    onMoveRef.current(e.clientX, e.clientY);
  }, []);

  return { ref, start, move };
}

const SpectrumPicker = memo(
  ({ hsv, onChange }: { hsv: Hsv; onChange: (hsv: Hsv) => void }) => {
    const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });
    const hexValue = hsvToHex(hsv);
    const rgb = hsvToRgb(hsv);

    const sv = useDrag((clientX, clientY) => {
      const el = sv.ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
      onChange({ ...hsv, s, v });
    });

    const hue = useDrag((clientX) => {
      const el = hue.ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 360;
      onChange({ ...hsv, h });
    });

    const setChannel = (key: keyof Rgb, raw: string) => {
      const n = clampByte(Number(raw) || 0);
      onChange(rgbToHsv({ ...rgb, [key]: n }));
    };

    const pickEyedropper = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dropper = new (window as any).EyeDropper();
        const result = await dropper.open();
        if (result?.sRGBHex && isHex(result.sRGBHex)) {
          onChange(rgbToHsv(hexToRgb(result.sRGBHex)));
        }
      } catch {
        /* user cancelled */
      }
    };

    return (
      <div className="flex flex-col gap-2">
        <div
          ref={sv.ref}
          onPointerDown={sv.start}
          onPointerMove={sv.move}
          className="relative h-32 w-full cursor-crosshair rounded touch-none"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})`,
          }}
        >
          <span
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
          />
        </div>

        <div
          ref={hue.ref}
          onPointerDown={hue.start}
          onPointerMove={hue.move}
          className="relative h-3 w-full cursor-ew-resize rounded-full touch-none"
          style={{
            background:
              'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {hasEyeDropper ? (
            <button
              type="button"
              onClick={pickEyedropper}
              title="Pick a colour from the screen"
              aria-label="Eyedropper"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pipette className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <span
            className="h-7 w-7 shrink-0 rounded border border-black/10"
            style={{ backgroundColor: hexValue }}
          />
          {(['r', 'g', 'b'] as const).map((key) => (
            <label key={key} className="flex flex-1 flex-col items-center">
              <input
                value={clampByte(rgb[key])}
                inputMode="numeric"
                onChange={(e) => setChannel(key, e.target.value)}
                className="w-full rounded border border-border bg-background px-1 py-1 text-center text-[11px] text-foreground"
                aria-label={key.toUpperCase()}
              />
              <span className="mt-0.5 text-[9px] uppercase text-muted-foreground">
                {key}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  },
);
SpectrumPicker.displayName = 'RashguardSpectrumPicker';

// ---------------------------------------------------------------------------
// Palette mode: swatch grid
// ---------------------------------------------------------------------------

const PalettePicker = memo(
  ({ value, onPick }: { value: string; onPick: (hex: string) => void }) => (
    <div className="flex flex-col gap-0.5">
      {PALETTE_ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-12 gap-0.5">
          {row.map((hex, ci) => (
            <button
              key={`${ri}-${ci}`}
              type="button"
              title={hex}
              aria-label={hex}
              onClick={() => onPick(hex)}
              className={`aspect-square w-full rounded-[2px] transition-transform hover:scale-110 ${
                value.toLowerCase() === hex.toLowerCase()
                  ? 'ring-2 ring-[#5c0000]'
                  : 'border border-black/10'
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      ))}
    </div>
  ),
);
PalettePicker.displayName = 'RashguardPalettePicker';

// ---------------------------------------------------------------------------
// The popover
// ---------------------------------------------------------------------------

const ColorPickerPopover = memo(
  ({
    value,
    anchorRect,
    inUseColors,
    onChange,
    onClose,
  }: {
    value: string;
    anchorRect: DOMRect;
    inUseColors: string[];
    onChange: (hex: string) => void;
    onClose: () => void;
  }) => {
    const safeValue = isHex(value) ? value : '#000000';
    const [mode, setMode] = useState<PickerMode>(readMode);
    // Internal HSV so dragging stays stable at s=0 / v=0.
    const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(safeValue)));
    const [hexDraft, setHexDraft] = useState(safeValue);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const recent = useRecentColors();

    // Keep internal state in sync when the colour changes from outside.
    useEffect(() => {
      const current = hsvToHex(hsv);
      if (current.toLowerCase() !== safeValue.toLowerCase()) {
        setHsv(rgbToHsv(hexToRgb(safeValue)));
        setHexDraft(safeValue);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeValue]);

    const commit = useCallback(
      (next: Hsv) => {
        setHsv(next);
        const hex = hsvToHex(next);
        setHexDraft(hex);
        onChange(hex);
      },
      [onChange],
    );

    const pickHex = useCallback(
      (hex: string) => {
        if (!isHex(hex)) return;
        commit(rgbToHsv(hexToRgb(hex)));
      },
      [commit],
    );

    const switchMode = (next: PickerMode) => {
      setMode(next);
      try {
        window.localStorage.setItem(MODE_KEY, next);
      } catch {
        /* ignore */
      }
    };

    // Close on outside click / Escape.
    useEffect(() => {
      const onDown = (e: MouseEvent) => {
        if (!cardRef.current?.contains(e.target as Node)) onClose();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('keydown', onKey);
      };
    }, [onClose]);

    // Position: fixed, anchored under the trigger, flipped/clamped to viewport.
    const WIDTH = 244;
    const [pos, setPos] = useState<{ left: number; top: number }>({
      left: anchorRect.left,
      top: anchorRect.bottom + 6,
    });
    useLayoutEffect(() => {
      const card = cardRef.current;
      const h = card?.offsetHeight ?? 320;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = Math.min(anchorRect.left, vw - WIDTH - 8);
      left = Math.max(8, left);
      let top = anchorRect.bottom + 6;
      if (top + h > vh - 8) top = Math.max(8, anchorRect.top - h - 6);
      setPos({ left, top });
    }, [anchorRect]);

    const inUse = useMemo(
      () => Array.from(new Set(inUseColors.map((c) => c.toLowerCase()))),
      [inUseColors],
    );

    const tabClass = (active: boolean) =>
      `flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        active
          ? 'bg-[#5c0000] text-white'
          : 'bg-background text-muted-foreground hover:bg-muted'
      }`;

    return createPortal(
      <div
        ref={cardRef}
        role="dialog"
        aria-label="Colour picker"
        className="fixed z-[60] rounded-lg border border-border bg-background p-2.5 shadow-xl"
        style={{ left: pos.left, top: pos.top, width: WIDTH }}
      >
        <div className="mb-2 flex gap-1 rounded-md border border-border bg-muted/40 p-0.5">
          <button
            type="button"
            className={tabClass(mode === 'spectrum')}
            onClick={() => switchMode('spectrum')}
          >
            <SlidersHorizontal className="h-3 w-3" /> Spectrum
          </button>
          <button
            type="button"
            className={tabClass(mode === 'palette')}
            onClick={() => switchMode('palette')}
          >
            <Grid2x2 className="h-3 w-3" /> Palette
          </button>
        </div>

        {mode === 'spectrum' ? (
          <SpectrumPicker hsv={hsv} onChange={commit} />
        ) : (
          <PalettePicker value={hsvToHex(hsv)} onPick={pickHex} />
        )}

        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hex
          </span>
          <input
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value);
              const next = normalizeHex(e.target.value);
              if (isHex(next)) pickHex(next.toLowerCase());
            }}
            onBlur={() => setHexDraft(hsvToHex(hsv))}
            className="h-6 flex-1 rounded border border-border bg-background px-1.5 font-mono text-[11px] text-foreground"
            aria-label="Hex colour value"
          />
        </div>

        {inUse.length ? (
          <div className="mt-2">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              In use
            </p>
            <div className="flex flex-wrap gap-1">
              {inUse.map((hex) => (
                <Swatch
                  key={`use-${hex}`}
                  hex={hex}
                  active={hex === hsvToHex(hsv).toLowerCase()}
                  onPick={pickHex}
                />
              ))}
            </div>
          </div>
        ) : null}

        {recent.length ? (
          <div className="mt-2">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recent
            </p>
            <div className="flex flex-wrap gap-1">
              {recent.map((hex) => (
                <Swatch
                  key={`recent-${hex}`}
                  hex={hex}
                  active={hex === hsvToHex(hsv).toLowerCase()}
                  onPick={pickHex}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>,
      document.body,
    );
  },
);
ColorPickerPopover.displayName = 'RashguardColorPickerPopover';

// ---------------------------------------------------------------------------
// Public field: the colour-box trigger + hex input that opens the popover
// ---------------------------------------------------------------------------

export const RashguardColorField = memo(
  ({
    value,
    label,
    inUseColors,
    onChange,
  }: {
    value: string;
    label: string;
    inUseColors: string[];
    onChange: (hex: string) => void;
  }) => {
    const [open, setOpen] = useState(false);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const [hexDraft, setHexDraft] = useState(value);
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => setHexDraft(value), [value]);

    const openPopover = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchorRect(rect);
      setOpen(true);
    };

    // Remember a colour once the popover closes (so we don't spam history on
    // every drag tick).
    const handleClose = () => {
      setOpen(false);
      if (isHex(value)) pushRecentColor(value);
    };

    const swatchValue = isHex(value) ? value : '#000000';

    return (
      <div className="flex shrink-0 items-center gap-1">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? handleClose() : openPopover())}
          className="h-6 w-7 rounded border border-border bg-background p-0.5"
          aria-label={`${label} colour picker`}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span
            className="block h-full w-full rounded-[2px] border border-black/10"
            style={{ backgroundColor: swatchValue }}
          />
        </button>
        <input
          value={hexDraft}
          onChange={(e) => {
            setHexDraft(e.target.value);
            const next = normalizeHex(e.target.value);
            if (isHex(next)) onChange(next.toLowerCase());
          }}
          onBlur={() => {
            const next = normalizeHex(hexDraft);
            setHexDraft(isHex(next) ? next.toLowerCase() : value);
          }}
          className="h-6 w-20 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground"
          aria-label={`${label} hex color`}
        />
        {open && anchorRect ? (
          <ColorPickerPopover
            value={value}
            anchorRect={anchorRect}
            inUseColors={inUseColors}
            onChange={onChange}
            onClose={handleClose}
          />
        ) : null}
      </div>
    );
  },
);
RashguardColorField.displayName = 'RashguardColorField';
