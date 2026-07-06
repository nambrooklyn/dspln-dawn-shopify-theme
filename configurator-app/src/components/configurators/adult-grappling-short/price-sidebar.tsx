import { memo, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, ShoppingCart } from 'lucide-react';

import {
  RASHGUARD_ARTWORK_TARGET_LABELS,
  RASHGUARD_BASE_PRICE,
  RASHGUARD_PART_LABELS,
  RASHGUARD_PARTS,
  nameForHex,
} from './rashguard-config';
import { useRashguardState } from './rashguard-state';

const DetailLine = memo(
  ({ label, value }: { label: string; value: string }) => (
    <li className="grid grid-cols-[minmax(0,1fr)_5.75rem] gap-1.5 text-[10px] leading-[1.45]">
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <span className="text-foreground min-w-0 truncate text-right font-medium">
        {value}
      </span>
    </li>
  ),
);
DetailLine.displayName = 'RashguardDetailLine';

interface RashguardPriceSidebarProps {
  onAddToCart: () => void;
  isAddingToCart?: boolean;
  cartActionLabel?: string;
  cartActionLoadingLabel?: string;
  headerContent?: ReactNode;
}

export const RashguardPriceSidebar = memo(
  ({
    onAddToCart,
    isAddingToCart,
    cartActionLabel = 'Add to Cart',
    cartActionLoadingLabel = 'Adding...',
    headerContent,
  }: RashguardPriceSidebarProps) => {
    const { size, partColors, artworkLayers, calculateTotal } =
      useRashguardState();
    const [colorsOpen, setColorsOpen] = useState(true);
    const [logosOpen, setLogosOpen] = useState(true);
    const total = calculateTotal();

    const colorDetails = useMemo(
      () =>
        RASHGUARD_PARTS.map((part) => ({
          label: RASHGUARD_PART_LABELS[part],
          value: nameForHex(partColors[part]) ?? partColors[part],
        })),
      [partColors],
    );

    const artworkDetails = useMemo(
      () =>
        artworkLayers.length > 0
          ? [...artworkLayers].reverse().map((layer, index) => ({
              id: layer.id,
              label:
                layer.kind === 'text'
                  ? layer.text || `Text ${artworkLayers.length - index}`
                  : layer.filename || `Artwork ${artworkLayers.length - index}`,
              value: RASHGUARD_ARTWORK_TARGET_LABELS[layer.target],
            }))
          : [{ id: 'empty-artwork', label: 'Artwork', value: 'No layers' }],
      [artworkLayers],
    );

    return (
      <aside className="bg-background hidden h-full min-h-0 w-[clamp(13rem,19vw,18rem)] shrink-0 flex-col border-l lg:flex">
        {headerContent ? (
          <div className="border-border flex min-h-12 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 xl:px-4">
            {headerContent}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col p-3 xl:p-4">
          <section className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ul className="divide-border divide-y">
              <li className="py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">Grappling Short</span>
                  <span className="shrink-0 font-mono text-xs">
                    ${RASHGUARD_BASE_PRICE}.00
                  </span>
                </div>
                <ul className="border-border/70 bg-muted/20 mt-1.5 space-y-0.5 border-t pt-1.5">
                  <DetailLine label="Size" value={size} />
                </ul>
              </li>

              <li className="py-2 text-sm">
                <button
                  type="button"
                  onClick={() => setColorsOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={colorsOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                        colorsOpen ? 'rotate-180' : '-rotate-90'
                      }`}
                    />
                    <span className="truncate">Colors</span>
                  </span>
                </button>
                {colorsOpen ? (
                  <ul className="border-border/70 bg-muted/20 mt-1.5 space-y-0.5 border-t pt-1.5">
                    {colorDetails.map((detail) => (
                      <DetailLine
                        key={detail.label}
                        label={detail.label}
                        value={detail.value}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>

              <li className="py-2 text-sm">
                <button
                  type="button"
                  onClick={() => setLogosOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={logosOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                        logosOpen ? 'rotate-180' : '-rotate-90'
                      }`}
                    />
                    <span className="truncate">Artwork</span>
                  </span>
                </button>
                {logosOpen ? (
                  <ul className="border-border/70 bg-muted/20 mt-1.5 space-y-0.5 border-t pt-1.5">
                    {artworkDetails.map((detail) => (
                      <DetailLine
                        key={detail.id}
                        label={detail.label}
                        value={detail.value}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            </ul>
          </section>

          <button
            type="button"
            onClick={onAddToCart}
            disabled={isAddingToCart}
            className="bg-foreground text-background hover:bg-foreground/90 mt-2 flex h-12 min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-md text-xs font-semibold tracking-[0.12em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAddingToCart ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            {isAddingToCart ? cartActionLoadingLabel : cartActionLabel}
          </button>
        </div>

        <div className="border-border shrink-0 border-t px-3 py-4 xl:px-4">
          <div className="flex items-baseline justify-between">
            <span className="text-foreground text-[11px] font-semibold tracking-wider uppercase">
              Total
            </span>
            <span className="text-foreground text-2xl font-semibold">
              ${total.toFixed(2)}
            </span>
          </div>
        </div>
      </aside>
    );
  },
);

RashguardPriceSidebar.displayName = 'RashguardPriceSidebar';
