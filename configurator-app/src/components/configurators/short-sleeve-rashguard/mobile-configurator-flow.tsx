import { memo } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';

import { useRashguardState } from './rashguard-state';
import {
  RashguardArtworkSections,
  RashguardGarmentSections,
} from './rashguard-sections';

const PANELS = [
  { key: 'garment', label: 'Garment' },
  { key: 'artwork', label: 'Artwork' },
] as const;

export const RashguardMobileConfiguratorFlow = memo(
  ({
    onAddToCart,
    isAddingToCart,
    cartActionLabel = 'Add',
    cartActionLoadingLabel = 'Adding...',
  }: {
    onAddToCart: () => void;
    isAddingToCart?: boolean;
    cartActionLabel?: string;
    cartActionLoadingLabel?: string;
  }) => {
    const { selectedPanel, setSelectedPanel, calculateTotal } =
      useRashguardState();

    return (
      <div className="bg-background border-t px-4 py-4 lg:hidden">
        <div className="bg-muted/60 mb-4 flex rounded-md p-1">
          {PANELS.map((panel) => (
            <button
              key={panel.key}
              type="button"
              onClick={() => setSelectedPanel(panel.key)}
              className={`flex-1 rounded px-3 py-2 text-xs font-semibold uppercase transition-colors ${
                selectedPanel === panel.key
                  ? 'border-border bg-background text-foreground border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {panel.label}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          {selectedPanel === 'garment' ? (
            <RashguardGarmentSections />
          ) : (
            <RashguardArtworkSections />
          )}
        </div>

        <div className="border-border mt-5 flex items-center justify-between border-t pt-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] uppercase">
              Total
            </p>
            <p className="text-2xl font-semibold">
              ${calculateTotal().toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            onClick={onAddToCart}
            disabled={isAddingToCart}
            className="bg-foreground text-background hover:bg-foreground/90 flex h-11 min-w-36 items-center justify-center gap-2 rounded-md px-4 text-xs font-semibold tracking-[0.12em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAddingToCart ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            {isAddingToCart ? cartActionLoadingLabel : cartActionLabel}
          </button>
        </div>
      </div>
    );
  },
);

RashguardMobileConfiguratorFlow.displayName = 'RashguardMobileConfiguratorFlow';
