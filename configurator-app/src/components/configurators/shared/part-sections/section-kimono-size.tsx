import { memo } from 'react';

import { useGiState } from '../../gi/gi-state';
import { SectionSizeRecommender } from './section-size-recommender';
import { SectionSizeWheelPicker } from './section-size-wheel-picker';
import { CUSTOM_MEASUREMENTS } from './size-options';

/**
 * Kimono Size section. Matches the D2C reference: title with the current
 * selection labeled on the right, paragraph copy with the size-guide
 * link, then the visual size picker.
 */
export const SectionKimonoSize = memo(() => {
  const { kimonoSize, setKimonoSize } = useGiState();
  const isCustom = kimonoSize === CUSTOM_MEASUREMENTS;

  return (
    <section className="border-border border-b px-3 py-3">
      <div className="mb-2 flex items-baseline gap-2 max-lg:hidden">
        <h3 className="text-foreground text-[12px] font-semibold tracking-wide uppercase">
          Kimono Size
        </h3>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {isCustom ? 'Custom Measurements' : kimonoSize || 'Choose size'}
        </span>
      </div>

      <p className="mb-3 text-[12px] leading-snug max-lg:hidden">
        <a
          href="https://dspln.com/pages/sizing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-medium hover:underline"
        >
          See detailed size guidelines
        </a>
      </p>

      <SectionSizeWheelPicker value={kimonoSize} onChange={setKimonoSize} />

      <p className="mt-3 mb-3 text-center text-[12px] leading-snug lg:hidden">
        <a
          href="https://dspln.com/pages/sizing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-medium hover:underline"
        >
          See detailed size guidelines
        </a>
      </p>

      <SectionSizeRecommender
        selectedSize={kimonoSize}
        onUseSize={setKimonoSize}
      />
    </section>
  );
});

SectionKimonoSize.displayName = 'SectionKimonoSize';
