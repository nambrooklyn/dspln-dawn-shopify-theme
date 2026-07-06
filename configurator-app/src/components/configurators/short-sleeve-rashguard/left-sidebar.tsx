import { memo } from 'react';

import { useRashguardState } from './rashguard-state';
import {
  RashguardArtworkSections,
  RashguardGarmentSections,
} from './rashguard-sections';

const PANELS = [
  { key: 'garment', label: 'Garment' },
  { key: 'artwork', label: 'Artwork' },
] as const;

export const RashguardLeftSidebar = memo(() => {
  const { selectedPanel, setSelectedPanel } = useRashguardState();

  return (
    <div className="bg-background hidden h-full w-[clamp(14rem,22vw,20rem)] shrink-0 flex-col border-r lg:flex">
      <div className="border-b px-3 py-1.5">
        <div className="bg-muted/60 flex rounded-md p-1">
          {PANELS.map((panel) => {
            const isActive = selectedPanel === panel.key;
            return (
              <button
                key={panel.key}
                type="button"
                onClick={() => setSelectedPanel(panel.key)}
                className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'border-border bg-background text-foreground border shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {panel.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedPanel === 'garment' ? (
          <RashguardGarmentSections />
        ) : (
          <RashguardArtworkSections />
        )}
      </div>
    </div>
  );
});

RashguardLeftSidebar.displayName = 'RashguardLeftSidebar';
