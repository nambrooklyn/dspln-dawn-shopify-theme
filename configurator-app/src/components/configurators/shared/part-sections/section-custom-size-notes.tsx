import { memo } from 'react';

import { CUSTOM_SIZE_PRICE } from '../../gi/gi-config';

/**
 * Notes box revealed when a size picker is set to "Custom Measurements".
 * The merchant types their measurements/notes here; selecting custom
 * sizing adds the flat CUSTOM_SIZE_PRICE upcharge (shown in the label so
 * the price change never surprises at checkout).
 */
export const SectionCustomSizeNotes = memo(
  ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (notes: string) => void;
  }) => (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-foreground text-[11px] font-semibold tracking-wide uppercase">
          Custom Measurements Notes
        </span>
        <span className="text-primary text-[11px] font-semibold">
          +${CUSTOM_SIZE_PRICE.toFixed(2)}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder="Type your measurements or sizing notes here (height, weight, sleeve length, etc.)"
        className="border-border bg-background text-foreground placeholder:text-muted-foreground w-full resize-y rounded-sm border px-2 py-1.5 text-[12px] leading-snug focus:outline-none"
      />
    </div>
  ),
);

SectionCustomSizeNotes.displayName = 'SectionCustomSizeNotes';
