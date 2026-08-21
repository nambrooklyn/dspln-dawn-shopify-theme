import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import {
  BELT_COLOR_SWATCHES,
  GI_COLOR_SWATCHES,
  GI_PART_DISPLAY,
  GI_PART_PRICES,
  KIMONO_SUBPART_CAMERA_VIEW,
  PANT_SUBPART_CAMERA_VIEW,
  type GiPart,
  type KimonoSubPart,
  type PantSubPart,
} from '../gi/gi-config';
import { useGiState } from '../gi/gi-state';
import { formatUsd } from './money';
import {
  BASE_SIZES,
  CUSTOM_MEASUREMENTS,
} from '../shared/part-sections/size-options';

/**
 * Compact all-zones color menu shown while a part is selected (Nam's mock):
 * one row per color zone — tiny label + the full swatch strip — so every
 * color option for the piece is one tap away without opening a panel.
 * Picking a swatch also glides the camera to that zone's close-up, same as
 * the v1 sidebar sections did.
 */

const KIMONO_ROWS: Array<{ sub: KimonoSubPart; label: string }> = [
  { sub: 'body', label: 'Body' },
  { sub: 'lapel', label: 'Lapel' },
  { sub: 'reinforcement', label: 'Inside' },
  { sub: 'stitching', label: 'Stitch' },
];

const PANT_ROWS: Array<{ sub: PantSubPart; label: string }> = [
  { sub: 'body', label: 'Body' },
  { sub: 'reinforcement', label: 'Reinf' },
  { sub: 'stitching', label: 'Stitch' },
  { sub: 'drawcord', label: 'Cord' },
];

/**
 * Custom size picker: a frosted popup sheet that looks identical on every
 * platform. (The native <select> renders as a jarring fullscreen black list
 * on Android Chrome — only a custom control keeps the iOS-style feel
 * everywhere.) Grouped one section per size family, Custom at the bottom.
 */
function SizeMatrix({
  value,
  onChange,
  withVariants,
  allowCustom,
}: {
  value: string;
  onChange: (size: string) => void;
  /** false = belt (base sizes only, no S/L variants) */
  withVariants: boolean;
  allowCustom: boolean;
}) {
  const [open, setOpen] = useState(false);

  const pick = (size: string) => {
    onChange(size);
    setOpen(false);
  };

  const optionRow = (size: string, label: string) => (
    <button
      key={size}
      type="button"
      onClick={() => pick(size)}
      aria-pressed={value === size}
      style={{ fontSize: '13px' }}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${
        value === size
          ? 'bg-black text-white'
          : 'text-black hover:bg-black/5 active:bg-black/10'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-black/55">
        Size
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ fontSize: '13px' }}
        className="flex h-7 w-0 min-w-0 flex-1 items-center justify-between rounded-md border border-black/10 bg-white/80 px-1.5 text-black"
        aria-label="Size"
      >
        <span className="truncate">{value || 'Select size…'}</span>
        <span aria-hidden="true" className="text-black/40">
          ⌄
        </span>
      </button>

      {open
        ? createPortal(
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close size picker"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/25"
          />
          <div className="absolute inset-x-6 bottom-8 mx-auto max-h-[60dvh] max-w-sm overflow-y-auto rounded-2xl border border-white/40 bg-white/90 p-2 shadow-[0_12px_48px_rgba(0,0,0,0.3)] backdrop-blur-2xl backdrop-saturate-150">
            {withVariants ? (
              BASE_SIZES.map((base) => (
                <div key={base} className="mb-1 border-b border-black/5 pb-1 last:border-b-0">
                  <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-black/35">
                    {base}
                  </div>
                  {optionRow(`${base}S`, `${base}S — Slim`)}
                  {optionRow(base, `${base} — Regular`)}
                  {optionRow(`${base}L`, `${base}L — Long`)}
                </div>
              ))
            ) : (
              <div>
                {BASE_SIZES.map((base) => optionRow(base, base))}
              </div>
            )}
            {allowCustom ? (
              <div className="mt-1 border-t border-black/10 pt-1">
                {optionRow(CUSTOM_MEASUREMENTS, 'Custom Measurements +$25')}
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
          )
        : null}
    </div>
  );
}

function SwatchRow({
  label,
  swatches,
  value,
  onChange,
}: {
  label: string;
  swatches: ReadonlyArray<{ name: string; hex: string }>;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-black/55">
        {label}
      </span>
      <div className="flex gap-1">
        {swatches.map((swatch) => {
          const isActive = swatch.hex.toLowerCase() === value.toLowerCase();
          const isWhite = swatch.hex.toLowerCase() === '#ffffff';
          return (
            <button
              key={`${label}-${swatch.hex}`}
              type="button"
              title={`${label} ${swatch.name}`}
              aria-label={`${label} ${swatch.name}`}
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
    </div>
  );
}

export const GiV5ZoneColorMenu = memo(
  ({ part, onClose }: { part: GiPart; onClose?: () => void }) => {
  const {
    partVisibility,
    kimonoSubColors,
    setKimonoSubColor,
    pantSubColors,
    setPantSubColor,
    partColors,
    setPartColor,
    kimonoSize,
    setKimonoSize,
    pantSize,
    setPantSize,
    beltSize,
    setBeltSize,
    customSizeNotes,
    setCustomSizeNotes,
    setCameraView,
    setPartVisible,
    setScenePartVisible,
  } = useGiState();

  // The top-right Sizes pill is gone (Nam's call) — the custom-measurement
  // notes it held live here now, shown only while Custom is selected.
  const activeSize =
    part === 'jacket' ? kimonoSize : part === 'pants' ? pantSize : beltSize;
  const showCustomNotes =
    part !== 'belt' && activeSize === CUSTOM_MEASUREMENTS;
  const included = partVisibility[part];

  return (
    <div className="pointer-events-auto relative flex flex-col gap-2 rounded-2xl border border-white/30 bg-white/25 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-2xl backdrop-saturate-150">
      {/* Close — returns to the zoomed-out full view. Tap-away also works,
          but nobody discovers that; the X is the visible exit. */}
      {onClose ? (
        <button
          type="button"
          aria-label="Close and return to full view"
          onClick={onClose}
          className="absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full text-black/45 transition hover:bg-black/5 hover:text-black"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
      {/* Add / Remove segmented toggle (Safari-tab style): the current state
          is a white chip, the other segment a quiet action. Removing hides
          only the 3D part — the menu and options stay so Add/Remove can be
          toggled freely; the menu only closes on tap-away. Aligned with the
          swatch grid (label column is w-14 + gap-2 = 4rem). */}
      <div className="mb-0.5 ml-16 flex rounded-lg border border-black/10 bg-black/5 p-0.5 backdrop-blur-2xl">
        {[
          {
            added: true,
            // The current segment states what IS; the other states the action.
            label: included
              ? `Included · ${formatUsd(GI_PART_PRICES[part], { compact: true })}`
              : `Add · +${formatUsd(GI_PART_PRICES[part], { compact: true })}`,
          },
          { added: false, label: included ? 'Remove' : 'Removed' },
        ].map(({ added, label }) => {
          const isCurrent = included === added;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={isCurrent}
              onClick={() => {
                if (isCurrent) return;
                setPartVisible(part, added);
                if (!added) setScenePartVisible(part, false);
              }}
              // fontSize inline: the app's `font: inherit` reset on buttons
              // overrides Tailwind text utilities.
              style={{ fontSize: '10px' }}
              className={`flex h-7 flex-1 items-center justify-center rounded-md px-2 font-medium whitespace-nowrap transition ${
                isCurrent
                  ? 'border border-black/10 bg-white text-black shadow-[0_1px_4px_rgba(0,0,0,0.12)]'
                  : 'text-black/50 hover:text-black'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {part === 'jacket' ? (
        <>
          {KIMONO_ROWS.map(({ sub, label }) => (
            <SwatchRow
              key={sub}
              label={label}
              swatches={GI_COLOR_SWATCHES}
              value={kimonoSubColors[sub]}
              onChange={(hex) => {
                setKimonoSubColor(sub, hex);
                setCameraView(KIMONO_SUBPART_CAMERA_VIEW[sub]);
              }}
            />
          ))}
          <SizeMatrix
            value={kimonoSize}
            onChange={setKimonoSize}
            withVariants
            allowCustom
          />
        </>
      ) : part === 'pants' ? (
        <>
          {PANT_ROWS.map(({ sub, label }) => (
            <SwatchRow
              key={sub}
              label={label}
              swatches={GI_COLOR_SWATCHES}
              value={pantSubColors[sub]}
              onChange={(hex) => {
                setPantSubColor(sub, hex);
                setCameraView(PANT_SUBPART_CAMERA_VIEW[sub]);
              }}
            />
          ))}
          <SizeMatrix
            value={pantSize}
            onChange={setPantSize}
            withVariants
            allowCustom
          />
        </>
      ) : (
        <>
          <SwatchRow
            label="Belt"
            swatches={BELT_COLOR_SWATCHES}
            value={partColors.belt}
            onChange={(hex) => {
              setPartColor('belt', hex);
              setCameraView('belt-close');
            }}
          />
          <SizeMatrix
            value={beltSize}
            onChange={setBeltSize}
            withVariants={false}
            allowCustom={false}
          />
        </>
      )}
      {showCustomNotes ? (
        <textarea
          value={customSizeNotes}
          onChange={(event) => setCustomSizeNotes(event.target.value)}
          placeholder="Height, weight, measurements…"
          rows={2}
          style={{ fontSize: '13px' }}
          className="mt-0.5 w-full rounded-lg border border-black/10 bg-white/80 px-2 py-1.5 text-black placeholder:text-black/30"
          aria-label="Custom measurement notes"
        />
      ) : null}
    </div>
  );
});
GiV5ZoneColorMenu.displayName = 'GiV5ZoneColorMenu';
