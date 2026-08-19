import { memo } from 'react';

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
 * Native size dropdown, grouped: one <optgroup> per size family (A00, A0, …)
 * so the browser renders a labelled gap between groups, with Custom
 * Measurements alone at the very bottom.
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
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-black/55">
        Size
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // w-0 + flex-1: the select fills the row but its content can NEVER
        // widen the menu card (a long selected label used to balloon it).
        // fontSize is inline because the app's unlayered `font: inherit`
        // reset on form elements beats Tailwind's layered text utilities.
        style={{ fontSize: '13px' }}
        className="h-7 w-0 min-w-0 flex-1 truncate rounded-md border border-black/10 bg-white/80 px-1.5 text-black"
        aria-label="Size"
      >
        <option value="" disabled>
          Select size…
        </option>
        {withVariants ? (
          BASE_SIZES.map((base) => (
            <optgroup key={base} label={base}>
              <option value={`${base}S`}>{base}S — Slim</option>
              <option value={base}>{base} — Regular</option>
              <option value={`${base}L`}>{base}L — Long</option>
            </optgroup>
          ))
        ) : (
          <optgroup label="Belt sizes">
            {BASE_SIZES.map((base) => (
              <option key={base} value={base}>
                {base}
              </option>
            ))}
          </optgroup>
        )}
        {allowCustom ? (
          <optgroup label="—">
            <option value={CUSTOM_MEASUREMENTS}>Custom +$25</option>
          </optgroup>
        ) : null}
      </select>
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
  ({ part }: { part: GiPart }) => {
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
    <div className="pointer-events-auto flex flex-col gap-2 rounded-2xl border border-white/30 bg-white/25 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-2xl backdrop-saturate-150">
      {/* Add / Remove segmented toggle (Safari-tab style): the current state
          is a white chip, the other segment a quiet action. Removing hides
          only the 3D part — the menu and options stay so Add/Remove can be
          toggled freely; the menu only closes on tap-away. Aligned with the
          swatch grid (label column is w-14 + gap-2 = 4rem). */}
      <div className="mb-0.5 ml-16 flex rounded-lg border border-black/10 bg-black/5 p-0.5 backdrop-blur-2xl">
        {[
          { added: true, label: `Add ${GI_PART_DISPLAY[part]} +$${GI_PART_PRICES[part]}` },
          { added: false, label: `Remove ${GI_PART_DISPLAY[part]}` },
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
