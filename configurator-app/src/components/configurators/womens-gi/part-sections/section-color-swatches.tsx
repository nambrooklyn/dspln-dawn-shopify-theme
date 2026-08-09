import { memo } from 'react';

import { GI_COLOR_SWATCHES, nameForHex } from '../gi-config';

type ColorSwatch = {
  name: string;
  hex: string;
};

interface SectionColorSwatchesProps {
  title: string;
  value: string;
  onChange: (hex: string) => void;
  swatches?: readonly ColorSwatch[];
}

/**
 * One color-picker section. Mirrors the D2C reference layout:
 *
 *   TITLE   |  CURRENT-COLOR-NAME
 *   [compact swatches in one row]
 *
 * The selected swatch is outlined with a contrasty ring so it's
 * visible even on dark hexes (black, navy, olive).
 */
export const SectionColorSwatches = memo(
  ({
    title,
    value,
    onChange,
    swatches = GI_COLOR_SWATCHES,
  }: SectionColorSwatchesProps) => {
    const currentName =
      swatches.find((s) => s.hex.toLowerCase() === value.toLowerCase())?.name ??
      nameForHex(value) ??
      'Custom';
    return (
      <section className="border-border border-b px-2 py-3">
        <div className="mb-2 flex items-baseline gap-2 max-lg:hidden">
          <h3 className="text-foreground text-[12px] font-semibold tracking-wide uppercase">
            {title}
          </h3>
          <span className="text-muted-foreground max-lg:hidden">|</span>
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase max-lg:hidden">
            {currentName}
          </span>
        </div>
        <div className="grid grid-cols-10 justify-start gap-0.5 max-lg:w-full max-lg:gap-1 max-lg:overflow-visible max-lg:pb-0">
          {swatches.map((swatch) => {
            const isActive = swatch.hex.toLowerCase() === value.toLowerCase();
            const isWhite = swatch.hex.toLowerCase() === '#ffffff';
            return (
              <div key={swatch.hex} className="w-[1.6875rem] shrink-0 max-lg:w-auto max-lg:min-w-0">
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
                <span className="text-foreground mt-2 hidden truncate text-center text-xs">
                  {swatch.name}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    );
  },
);

SectionColorSwatches.displayName = 'SectionColorSwatches';
