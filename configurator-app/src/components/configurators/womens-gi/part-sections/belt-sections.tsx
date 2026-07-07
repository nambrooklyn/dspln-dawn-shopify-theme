import { memo } from 'react';

import { useGiState } from '../gi-state';
import {
  BELT_COLOR_SWATCHES,
  BELT_FONT_OPTIONS,
  GI_COLOR_SWATCHES,
  nameForHex,
} from '../gi-config';
import { SectionAddRemove } from './section-add-remove';
import { SectionColorSwatches } from './section-color-swatches';
import { BELT_BASE_SIZES } from './size-options';

const FONT_OPTIONS = BELT_FONT_OPTIONS.map((font) => ({
  label: font.name,
  value: font.name,
}));

export const BeltEndTextSection = memo(
  ({
    title,
    value,
    placeholder,
    font,
    color,
    onTextChange,
    onFontChange,
    onColorChange,
  }: {
    title: string;
    value: string;
    placeholder: string;
    font: string;
    color: string;
    onTextChange: (value: string) => void;
    onFontChange: (value: string) => void;
    onColorChange: (value: string) => void;
  }) => {
    const currentColorName = nameForHex(color) ?? 'Custom';

    return (
      <section className="border-border border-b px-3 py-3">
        <div className="mb-2 flex items-baseline gap-2 max-lg:hidden">
          <h3 className="text-foreground text-[12px] font-semibold tracking-wide uppercase">
            {title}
          </h3>
          <span className="text-muted-foreground max-lg:hidden">|</span>
          <span className="text-muted-foreground truncate text-[10px] font-medium tracking-wide uppercase max-lg:hidden">
            {value.trim() || 'None'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <input
              value={value}
              maxLength={18}
              onChange={(e) => onTextChange(e.target.value.toUpperCase())}
              placeholder={placeholder}
              className="border-border bg-background text-foreground focus:border-foreground h-8 w-full rounded border px-2 pr-10 text-xs transition-colors placeholder:text-[#d6d9e1]"
            />
            <div className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[9px]">
              {value.length}/18
            </div>
          </div>
          <select
            value={font}
            onChange={(e) => onFontChange(e.target.value)}
            className="border-border bg-background text-foreground focus:border-foreground h-8 w-full rounded border px-2 text-xs transition-colors"
          >
            {FONT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <div className="mb-2 flex items-baseline gap-2 max-lg:hidden">
            <span className="text-foreground text-[11px] font-semibold tracking-wide uppercase">
              Color
            </span>
            <span className="text-muted-foreground max-lg:hidden">|</span>
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase max-lg:hidden">
              {currentColorName}
            </span>
          </div>
          <div className="grid grid-cols-10 justify-start gap-0.5 max-lg:w-full max-lg:gap-1 max-lg:overflow-visible max-lg:pb-0">
            {GI_COLOR_SWATCHES.map((swatch) => {
              const isActive = swatch.hex.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  onClick={() => onColorChange(swatch.hex)}
                  title={swatch.name}
                  aria-label={swatch.name}
                  aria-pressed={isActive}
                  className={`relative aspect-square w-[1.6875rem] shrink-0 rounded-[3px] transition-transform max-lg:w-full max-lg:min-w-0 ${
                    isActive
                      ? 'border-white ring-2 ring-[#5c0000] ring-offset-2 ring-offset-white'
                      : 'border-border border hover:scale-105'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                />
              );
            })}
          </div>
        </div>
      </section>
    );
  },
);

BeltEndTextSection.displayName = 'BeltEndTextSection';

/**
 * Belt customization sections. v1 ships with just the intro + add/remove
 * toggle so the merchant can include/exclude the belt. Embroidered text
 * controls land in the next iteration.
 */
export const BeltSections = memo(() => {
  const {
    partVisibility,
    setPartVisible,
    partColors,
    setPartColor,
    beltSize,
    setBeltSize,
    beltEmbroidery,
    setBeltEmbroidery,
  } = useGiState();
  return (
    <div className="flex flex-col">
      <SectionAddRemove
        addLabel="Add Belt +$15"
        removeLabel="Remove Belt"
        included={partVisibility.belt}
        onAdd={() => setPartVisible('belt', true)}
        onRemove={() => setPartVisible('belt', false)}
      />
      <section className="border-border border-b px-3 py-3">
        <div className="mb-2 flex items-baseline gap-2 max-lg:hidden">
          <h3 className="text-foreground text-[12px] font-semibold tracking-wide uppercase">
            Belt Size
          </h3>
          <span className="text-muted-foreground max-lg:hidden">|</span>
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase max-lg:hidden">
            {beltSize}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {BELT_BASE_SIZES.map((size) => {
            const isSelected = size === beltSize;
            return (
              <button
                key={size}
                type="button"
                onClick={() => setBeltSize(size)}
                aria-pressed={isSelected}
                className={`h-7 rounded-sm border text-[13px] font-bold tracking-wide text-[#17115f] transition-colors ${
                  isSelected
                    ? 'border-2 border-[#17115f] bg-white shadow-sm'
                    : 'border-border bg-background hover:border-[#17115f]/50'
                }`}
              >
                {size}
              </button>
            );
          })}
        </div>
      </section>
      <SectionColorSwatches
        title="Belt Color"
        value={partColors.belt}
        onChange={(hex) => setPartColor('belt', hex)}
        swatches={BELT_COLOR_SWATCHES}
      />
      <BeltEndTextSection
        title="Left Belt End Text"
        value={beltEmbroidery.leftEnd}
        placeholder="TEXT HERE"
        font={beltEmbroidery.leftFont}
        color={beltEmbroidery.leftThreadColor}
        onTextChange={(leftEnd) => setBeltEmbroidery({ leftEnd })}
        onFontChange={(leftFont) => setBeltEmbroidery({ leftFont })}
        onColorChange={(leftThreadColor) =>
          setBeltEmbroidery({ leftThreadColor })
        }
      />
      <BeltEndTextSection
        title="Right Belt End Text"
        value={beltEmbroidery.rightEnd}
        placeholder="TEXT HERE"
        font={beltEmbroidery.rightFont}
        color={beltEmbroidery.rightThreadColor}
        onTextChange={(rightEnd) => setBeltEmbroidery({ rightEnd })}
        onFontChange={(rightFont) => setBeltEmbroidery({ rightFont })}
        onColorChange={(rightThreadColor) =>
          setBeltEmbroidery({ rightThreadColor })
        }
      />
    </div>
  );
});

BeltSections.displayName = 'BeltSections';
