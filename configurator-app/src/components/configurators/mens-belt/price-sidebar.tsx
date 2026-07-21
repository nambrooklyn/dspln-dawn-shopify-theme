import { memo, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, ShoppingCart } from 'lucide-react';

import { useGiState } from './gi-state';
import {
  GI_PART_DISPLAY,
  GI_PART_PRICES,
  KIMONO_LOGO_SLOT_LABEL,
  KIMONO_LOGO_SLOTS,
  KIMONO_SUBPART_LABEL,
  KIMONO_SUBPARTS,
  PANT_LOGO_SLOT_LABEL,
  PANT_LOGO_SLOTS,
  PANT_SUBPART_LABEL,
  PANT_SUBPARTS,
  nameForBeltHex,
  nameForHex,
  type GiPart,
  type KimonoLogoSlot,
} from './gi-config';

const PART_ORDER: GiPart[] = ['belt'];
const ADD_ON_PRICE = 10;
const BACK_LOGO_PRICE = 25;

const DetailLine = memo(
  ({ label, value }: { label: string; value: string }) => (
    <li className="grid grid-cols-[minmax(0,1fr)_5.25rem] gap-1.5 text-[10px] leading-[1.45]">
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <span className="text-foreground min-w-0 truncate text-right font-medium">
        {value}
      </span>
    </li>
  ),
);
DetailLine.displayName = 'DetailLine';

function addOnPrice(active: boolean, inactiveLabel: string) {
  return active ? `$${ADD_ON_PRICE}.00` : inactiveLabel;
}

function logoPrice(filename: string | undefined) {
  return addOnPrice(!!filename, 'No logo');
}

function kimonoLogoPrice(slot: KimonoLogoSlot, filename: string | undefined) {
  if (!filename) return 'No logo';
  const price = slot === 'back' ? BACK_LOGO_PRICE : ADD_ON_PRICE;
  return `$${price}.00`;
}

function textPrice(value: string) {
  return addOnPrice(!!value.trim(), 'No text');
}

function colorName(hex: string) {
  return nameForHex(hex) ?? hex;
}

function beltColorName(hex: string) {
  return nameForBeltHex(hex) ?? hex;
}

/**
 * Right-side price summary. Lists each included part with its price
 * and a running total at the bottom. Updates live as the merchant
 * toggles parts on/off via the Add/Remove buttons in the left sidebar.
 */
interface PriceSidebarProps {
  onAddToCart: () => void;
  isAddingToCart?: boolean;
  cartActionLabel?: string;
  cartActionLoadingLabel?: string;
  headerContent?: ReactNode;
}

export const PriceSidebar = memo(
  ({
    onAddToCart,
    isAddingToCart,
    cartActionLabel = 'Add to Cart',
    cartActionLoadingLabel = 'Adding...',
    headerContent,
  }: PriceSidebarProps) => {
    const {
      partColors,
      partVisibility,
      kimonoSize,
      kimonoSubColors,
      kimonoLogos,
      beltSize,
      beltEmbroidery,
      pantSize,
      pantSubColors,
      pantLogos,
      textLayers,
    } = useGiState();
    const [openParts, setOpenParts] = useState<
      Partial<Record<GiPart, boolean>>
    >({});

    const included = useMemo(
      () => PART_ORDER.filter((p) => partVisibility[p]),
      [partVisibility],
    );
    const addOnTotal = useMemo(() => {
      const kimonoLogoTotal = partVisibility.jacket
        ? KIMONO_LOGO_SLOTS.reduce((sum, slot) => {
            if (!kimonoLogos[slot]) return sum;
            return sum + (slot === 'back' ? BACK_LOGO_PRICE : ADD_ON_PRICE);
          }, 0)
        : 0;
      const pantLogoTotal = partVisibility.pants
        ? Object.values(pantLogos).filter(Boolean).length * ADD_ON_PRICE
        : 0;
      const beltTextTotal = partVisibility.belt
        ? (beltEmbroidery.leftEnd.trim() ? 1 : 0) +
          (beltEmbroidery.rightEnd.trim() ? 1 : 0)
        : 0;
      // Free-placement text layers render on the jacket.
      const textLayerTotal = partVisibility.jacket
        ? textLayers.length * ADD_ON_PRICE
        : 0;
      return (
        kimonoLogoTotal +
        pantLogoTotal +
        beltTextTotal * ADD_ON_PRICE +
        textLayerTotal
      );
    }, [
      beltEmbroidery.leftEnd,
      beltEmbroidery.rightEnd,
      kimonoLogos,
      pantLogos,
      partVisibility.belt,
      partVisibility.jacket,
      partVisibility.pants,
      textLayers,
    ]);
    const total = useMemo(
      () =>
        included.reduce((sum, p) => sum + GI_PART_PRICES[p], 0) + addOnTotal,
      [addOnTotal, included],
    );

    const details = useMemo<
      Record<GiPart, Array<{ label: string; value: string }>>
    >(
      () => ({
        jacket: [
          {
            label: 'Size',
            value: kimonoSize,
          },
          ...KIMONO_SUBPARTS.map((subPart) => ({
            label: KIMONO_SUBPART_LABEL[subPart],
            value: colorName(kimonoSubColors[subPart]),
          })),
          ...KIMONO_LOGO_SLOTS.map((slot) => ({
            label: KIMONO_LOGO_SLOT_LABEL[slot].replace(/^Logo on /, ''),
            value: kimonoLogoPrice(slot, kimonoLogos[slot]?.filename),
          })),
          ...textLayers.map((layer, index) => ({
            label: `Text ${index + 1}: ${layer.text}`,
            value: `$${ADD_ON_PRICE}.00`,
          })),
        ],
        belt: [
          {
            label: 'Size',
            value: beltSize,
          },
          {
            label: 'Belt Color',
            value: beltColorName(partColors.belt),
          },
          {
            label: 'Left text',
            value: textPrice(beltEmbroidery.leftEnd),
          },
          {
            label: 'Left font',
            value: beltEmbroidery.leftFont,
          },
          {
            label: 'Left color',
            value: colorName(beltEmbroidery.leftThreadColor),
          },
          {
            label: 'Right text',
            value: textPrice(beltEmbroidery.rightEnd),
          },
          {
            label: 'Right font',
            value: beltEmbroidery.rightFont,
          },
          {
            label: 'Right color',
            value: colorName(beltEmbroidery.rightThreadColor),
          },
        ],
        pants: [
          {
            label: 'Size',
            value: pantSize,
          },
          ...PANT_SUBPARTS.map((subPart) => ({
            label: PANT_SUBPART_LABEL[subPart],
            value: colorName(pantSubColors[subPart]),
          })),
          ...PANT_LOGO_SLOTS.map((slot) => ({
            label: PANT_LOGO_SLOT_LABEL[slot].replace(/^Logo on /, ''),
            value: logoPrice(pantLogos[slot]?.filename),
          })),
        ],
      }),
      [
        beltEmbroidery.leftEnd,
        beltEmbroidery.leftFont,
        beltEmbroidery.leftThreadColor,
        beltEmbroidery.rightEnd,
        beltEmbroidery.rightFont,
        beltEmbroidery.rightThreadColor,
        beltSize,
        kimonoLogos,
        kimonoSize,
        kimonoSubColors,
        pantLogos,
        pantSize,
        pantSubColors,
        partColors.belt,
        textLayers,
      ],
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
              {PART_ORDER.map((part) => {
                const isIn = partVisibility[part];
                const price = GI_PART_PRICES[part];
                // A removed part collapses to just its struck-through header —
                // no customization details for something that isn't purchased
                // (same rule as the tech pack and cart). Reopens on re-add.
                const isOpen = isIn && !!openParts[part];
                return (
                  <li
                    key={part}
                    className={`py-2 text-sm ${
                      isIn ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenParts((prev) => ({
                          ...prev,
                          [part]: !prev[part],
                        }))
                      }
                      className="flex w-full items-center justify-between gap-3 text-left"
                      aria-expanded={isOpen}
                    >
                      <span
                        className={`flex min-w-0 items-center gap-2 ${
                          isIn ? '' : 'line-through'
                        }`}
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                            isOpen ? 'rotate-180' : '-rotate-90'
                          } ${isIn ? '' : 'invisible'}`}
                        />
                        <span className="truncate">
                          {GI_PART_DISPLAY[part]}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs">
                        {price > 0 ? `$${price}.00` : 'Included'}
                      </span>
                    </button>
                    {isOpen ? (
                      <ul className="border-border/70 bg-muted/20 mt-1.5 space-y-0.5 border-t pt-1.5">
                        {details[part].map((detail) => (
                          <DetailLine
                            key={`${part}-${detail.label}`}
                            label={detail.label}
                            value={detail.value}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
          <button
            type="button"
            onClick={onAddToCart}
            disabled={isAddingToCart}
            className="bg-foreground text-background hover:bg-foreground/90 mt-3 flex h-12 min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-md text-xs font-semibold tracking-[0.12em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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

PriceSidebar.displayName = 'PriceSidebar';
