import { memo } from 'react';

import { useGiState } from '../gi-state';
import { SectionCustomSizeNotes } from './section-custom-size-notes';
import { CUSTOM_MEASUREMENTS } from './size-options';

import { SIZE_OPTIONS } from './kids-size-options';

interface SectionSizeSelectProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
}

const CustomNotes = () => {
  const { customSizeNotes, setCustomSizeNotes } = useGiState();
  return (
    <SectionCustomSizeNotes
      value={customSizeNotes}
      onChange={setCustomSizeNotes}
    />
  );
};

export const SectionSizeSelect = memo(
  ({ title, value, onChange }: SectionSizeSelectProps) => (
    <section className="border-border border-b px-3 py-3">
      <div className="mb-2 flex items-baseline gap-2 max-lg:hidden">
        <h3 className="text-foreground text-[12px] font-semibold tracking-wide uppercase">
          {title}
        </h3>
        <span className="text-muted-foreground">|</span>
      <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {value || 'Choose size'}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {SIZE_OPTIONS.map((size) => {
          const isSelected = value === size;
          return (
            <button
              key={size}
              type="button"
              onClick={() => onChange(size)}
              aria-pressed={isSelected}
              className={`h-8 rounded-sm border text-[12px] font-bold tracking-wide text-[#17115f] transition-colors ${
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
      <button
        type="button"
        onClick={() => onChange(CUSTOM_MEASUREMENTS)}
        aria-pressed={value === CUSTOM_MEASUREMENTS}
        className={`mt-1 h-8 w-full rounded-sm border text-[12px] font-bold tracking-wide text-[#17115f] uppercase transition-colors ${
          value === CUSTOM_MEASUREMENTS
            ? 'border-2 border-[#17115f] bg-white shadow-sm'
            : 'border-border bg-background hover:border-[#17115f]/50'
        }`}
      >
        Custom Measurements
      </button>

      {value === CUSTOM_MEASUREMENTS ? <CustomNotes /> : null}
    </section>
  ),
);

SectionSizeSelect.displayName = 'SectionSizeSelect';
