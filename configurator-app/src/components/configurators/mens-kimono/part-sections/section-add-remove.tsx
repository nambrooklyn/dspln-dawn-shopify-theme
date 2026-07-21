import { memo } from 'react';

interface SectionAddRemoveProps {
  description?: string;
  addLabel: string;
  removeLabel: string;
  included: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

/**
 * Reusable "intro + Add/Remove" section that mirrors the first block of
 * each accordion section on the D2C reference. Selected button gets the
 * filled style; the other gets an outline.
 */
export const SectionAddRemove = memo(
  ({
    description,
    addLabel,
    removeLabel,
    included,
    onAdd,
    onRemove,
  }: SectionAddRemoveProps) => (
    <section className="border-border border-b px-3 py-2 max-lg:border-b-0 max-lg:px-0 max-lg:py-0">
      {description ? (
        <p className="text-foreground mb-2 text-[11px] leading-snug max-lg:text-center max-lg:text-xs max-lg:leading-snug">
          {description}
        </p>
      ) : null}
      <div className="flex gap-2 max-lg:grid max-lg:grid-cols-2 max-lg:overflow-visible max-lg:pb-1">
        <button
          type="button"
          onClick={onAdd}
          className={`flex h-9 flex-1 items-center justify-center rounded-md border px-1 transition-colors max-lg:h-8 max-lg:min-w-0 max-lg:px-2 ${
            included
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-background text-foreground hover:border-foreground'
          }`}
        >
          <span className="whitespace-nowrap text-[12px] leading-none font-semibold tracking-normal uppercase">
            {addLabel}
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className={`flex h-9 flex-1 items-center justify-center rounded-md border px-1 transition-colors max-lg:h-8 max-lg:min-w-0 max-lg:px-2 ${
            !included
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-background text-foreground hover:border-foreground'
          }`}
        >
          <span className="whitespace-nowrap text-[12px] leading-none font-semibold tracking-normal uppercase">
            {removeLabel}
          </span>
        </button>
      </div>
    </section>
  ),
);

SectionAddRemove.displayName = 'SectionAddRemove';
