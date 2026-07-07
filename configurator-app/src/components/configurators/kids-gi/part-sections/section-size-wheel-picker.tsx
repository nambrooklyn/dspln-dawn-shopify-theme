import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { ChevronDown, ChevronUp } from 'lucide-react';

import { BASE_SIZES, CUSTOM_MEASUREMENTS } from './size-options';

const SIZE_COLUMNS = [
  { label: 'Short', suffix: 'S' },
  { label: 'Regular', suffix: '' },
  { label: 'Long', suffix: 'L' },
] as const;

const ROW_HEIGHT = 24;
const WHEEL_HEIGHT = ROW_HEIGHT * 3;

function parseSize(value: string) {
  const suffix =
    value.endsWith('S') || value.endsWith('L') ? value.slice(-1) : '';
  const base = suffix ? value.slice(0, -1) : value;

  return {
    base: BASE_SIZES.includes(base as (typeof BASE_SIZES)[number])
      ? (base as (typeof BASE_SIZES)[number])
      : BASE_SIZES[0],
    suffix,
  };
}

function sizeValue(base: string, suffix: string) {
  return `${base}${suffix}`;
}

interface SectionSizeWheelPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export const SectionSizeWheelPicker = memo(
  ({ value, onChange }: SectionSizeWheelPickerProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const parsed = useMemo(() => parseSize(value), [value]);
    const isCustom = value === CUSTOM_MEASUREMENTS;
    const hasSelection = Boolean(value);
    const activeIndex = isCustom
      ? BASE_SIZES.length
      : BASE_SIZES.indexOf(parsed.base);
    const activeSuffix = isCustom ? 'L' : parsed.suffix;

    useEffect(() => {
      scrollRef.current?.scrollTo({
        top: activeIndex * ROW_HEIGHT,
        behavior: 'smooth',
      });
    }, [activeIndex]);

    const handleScroll = useCallback(() => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        const scrollTop = scrollRef.current?.scrollTop ?? 0;
        const nextIndex = Math.min(
          BASE_SIZES.length,
          Math.max(0, Math.round(scrollTop / ROW_HEIGHT)),
        );

        if (!hasSelection || nextIndex !== activeIndex) {
          onChange(
            nextIndex === BASE_SIZES.length
              ? CUSTOM_MEASUREMENTS
              : sizeValue(BASE_SIZES[nextIndex], activeSuffix),
          );
        }
      }, 70);
    }, [activeIndex, activeSuffix, hasSelection, onChange]);

    const shiftBase = (direction: -1 | 1) => {
      const nextIndex = activeIndex + direction;
      if (nextIndex < 0 || nextIndex > BASE_SIZES.length) return;
      onChange(
        nextIndex === BASE_SIZES.length
          ? CUSTOM_MEASUREMENTS
          : sizeValue(BASE_SIZES[nextIndex], activeSuffix),
      );
    };

    useEffect(
      () => () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      },
      [],
    );

    return (
      <div className="mt-3">
        <div className="text-muted-foreground mb-1 grid grid-cols-3 px-3 text-center text-[10px] tracking-wide uppercase">
          {SIZE_COLUMNS.map((column) => (
            <span key={column.label}>{column.label}</span>
          ))}
        </div>
        {!hasSelection ? (
          <p className="text-muted-foreground mb-1 text-center text-[10px] font-medium tracking-wide uppercase">
            Select size
          </p>
        ) : null}

        <div className="border-border relative overflow-hidden rounded border bg-background px-2 py-1">
          <button
            type="button"
            onClick={() => shiftBase(-1)}
            disabled={activeIndex === 0}
            className="text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 mx-auto flex h-3 w-12 items-center justify-center transition-colors"
            aria-label="Previous size row"
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <div className="pointer-events-none absolute inset-x-2 top-4 z-10 h-5 bg-gradient-to-b from-background to-transparent" />
          <div className="pointer-events-none absolute inset-x-2 bottom-4 z-10 h-5 bg-gradient-to-t from-background to-transparent" />
          <div className="border-border/70 pointer-events-none absolute inset-x-2 top-1/2 z-10 h-6 -translate-y-1/2 rounded-sm border" />

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="scroll-smooth snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ height: WHEEL_HEIGHT }}
          >
            <div style={{ height: ROW_HEIGHT }} />
            {BASE_SIZES.map((base) => {
              const isActiveRow = hasSelection && !isCustom && base === parsed.base;

              return (
                <div
                  key={base}
                  className={`grid snap-center grid-cols-3 gap-1 text-center ${
                    isActiveRow ? 'opacity-100' : 'opacity-35 blur-[0.45px]'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  {SIZE_COLUMNS.map((column) => {
                    const option = sizeValue(base, column.suffix);
                    const isSelected = option === value;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        className={`h-6 rounded-sm border text-[15px] font-bold tracking-wide text-[#17115f] transition-colors ${
                          isSelected
                            ? 'border-2 border-[#17115f] bg-white shadow-sm'
                            : 'border-transparent hover:border-border'
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            <div
              className={`grid snap-center grid-cols-3 gap-1 text-center ${
                hasSelection && isCustom ? 'opacity-100' : 'opacity-35 blur-[0.45px]'
              }`}
              style={{ height: ROW_HEIGHT }}
            >
              <button
                type="button"
                onClick={() => onChange(CUSTOM_MEASUREMENTS)}
                className={`col-span-3 h-6 rounded-sm border text-[8px] font-bold tracking-wide text-[#17115f] uppercase transition-colors ${
                  isCustom
                    ? 'border-2 border-[#17115f] bg-white shadow-sm'
                    : 'border-transparent hover:border-border'
                }`}
              >
                Custom Measurements
              </button>
            </div>
            <div style={{ height: ROW_HEIGHT }} />
          </div>

          <button
            type="button"
            onClick={() => shiftBase(1)}
            disabled={activeIndex === BASE_SIZES.length}
            className="text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 mx-auto flex h-3 w-12 items-center justify-center transition-colors"
            aria-label="Next size row"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

      </div>
    );
  },
);

SectionSizeWheelPicker.displayName = 'SectionSizeWheelPicker';
