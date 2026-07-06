import { memo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { useGiState } from '../gi/gi-state';
import { GI_PART_LABELS, type GiPart } from '../gi/gi-config';

/**
 * One accordion section in the CUSTOMIZE panel. Visually matches the
 * D2C reference (https://dspln.com/products/customgi) — section title
 * on the left, +/- on the right, content below when open.
 */
const AccordionSection = memo(
  ({
    title,
    open,
    onToggle,
    children,
  }: {
    title: string;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
  }) => (
    <div className="border-border border-b">
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-muted/40 flex w-full items-center justify-between px-4 py-4 text-sm font-semibold tracking-wide uppercase transition-colors"
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? <div className="bg-muted/20 px-4 pb-5">{children}</div> : null}
    </div>
  ),
);
AccordionSection.displayName = 'AccordionSection';

/**
 * Kimono section content (v1: intro text + ADD/REMOVE toggle).
 * More sections (size, logo areas, etc.) get appended below as we
 * work through the spec.
 */
const KimonoSection = memo(() => {
  const { partVisibility, setPartVisible } = useGiState();
  const included = partVisibility.jacket;
  return (
    <div className="space-y-4">
      <p className="text-foreground text-sm">
        Kimono is made of 350gsm Pearl Weave fabric.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPartVisible('jacket', true)}
          className={`flex-1 border px-3 py-2.5 text-[11px] font-semibold tracking-wide uppercase transition-colors ${
            included
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-background text-foreground hover:border-foreground'
          }`}
        >
          Add Kimono (+$55)
        </button>
        <button
          type="button"
          onClick={() => setPartVisible('jacket', false)}
          className={`flex-1 border px-3 py-2.5 text-[11px] font-semibold tracking-wide uppercase transition-colors ${
            !included
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-background text-foreground hover:border-foreground'
          }`}
        >
          Remove Kimono
        </button>
      </div>
    </div>
  );
});
KimonoSection.displayName = 'KimonoSection';

const BeltSection = memo(() => (
  <div className="text-muted-foreground text-sm">
    Belt customization options — coming next.
  </div>
));
BeltSection.displayName = 'BeltSection';

const PantSection = memo(() => (
  <div className="text-muted-foreground text-sm">
    Pant customization options — coming next.
  </div>
));
PantSection.displayName = 'PantSection';

const PART_LABEL: Record<GiPart, string> = {
  jacket: 'Kimono',
  belt: 'Belt',
  pants: 'Pant',
};

/**
 * Right-side CUSTOMIZE panel — accordion mirror of dspln.com's
 * customization sidebar. Order: Kimono → Belt → Pant.
 */
export const CustomizePanel = memo(() => {
  const [openPart, setOpenPart] = useState<GiPart | null>('jacket');

  const toggle = (part: GiPart) =>
    setOpenPart((curr) => (curr === part ? null : part));

  return (
    <aside className="bg-background flex h-full w-80 shrink-0 flex-col border-l">
      <div className="text-foreground border-border border-b px-4 py-4 text-center text-[11px] font-semibold tracking-[0.18em] uppercase">
        Customize
      </div>
      <div className="flex-1 overflow-y-auto">
        <AccordionSection
          title={PART_LABEL.jacket}
          open={openPart === 'jacket'}
          onToggle={() => toggle('jacket')}
        >
          <KimonoSection />
        </AccordionSection>
        <AccordionSection
          title={PART_LABEL.belt}
          open={openPart === 'belt'}
          onToggle={() => toggle('belt')}
        >
          <BeltSection />
        </AccordionSection>
        <AccordionSection
          title={PART_LABEL.pants}
          open={openPart === 'pants'}
          onToggle={() => toggle('pants')}
        >
          <PantSection />
        </AccordionSection>
      </div>
    </aside>
  );
});

CustomizePanel.displayName = 'CustomizePanel';

// Suppress unused-warning for the map we'll wire up in the next iteration
// when other configurators reuse this shell.
void GI_PART_LABELS;
