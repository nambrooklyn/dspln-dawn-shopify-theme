import { memo } from 'react';

import { SectionSizeRecommender } from './section-size-recommender';
import { SectionSizeWheelPicker } from './section-size-wheel-picker';

interface SectionSizeSelectProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
}

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
      <SectionSizeWheelPicker value={value} onChange={onChange} />

      <SectionSizeRecommender selectedSize={value} onUseSize={onChange} />
    </section>
  ),
);

SectionSizeSelect.displayName = 'SectionSizeSelect';
