import { memo, useMemo } from 'react';
import { X } from 'lucide-react';

import { useDrawerDialog } from './use-drawer-dialog';

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
} from '../kids-gi/gi-config';
import { useGiState } from '../kids-gi/gi-state';
import { formatUsd } from './money';

/**
 * Order-summary drawer: tapping the bag opens this instead of adding to
 * cart immediately. Rows mirror the live site's price sidebar exactly —
 * every zone color, every logo slot ("$10.00" / "No logo"), belt text with
 * font and thread color — with a full-width ADD TO CART at the bottom.
 */

const PART_ORDER: GiPart[] = ['jacket', 'belt', 'pants'];
const ADD_ON_PRICE = 10;
const BACK_LOGO_PRICE = 25;

function kimonoLogoPrice(slot: KimonoLogoSlot, filename: string | undefined) {
  if (!filename) return 'No logo';
  return formatUsd(slot === 'back' ? BACK_LOGO_PRICE : ADD_ON_PRICE);
}

function logoPrice(filename: string | undefined) {
  return filename ? formatUsd(ADD_ON_PRICE) : 'No logo';
}

function textPrice(value: string) {
  return value.trim() ? formatUsd(ADD_ON_PRICE) : 'No text';
}

function colorName(hex: string) {
  return nameForHex(hex) ?? hex;
}

export const GiV5CartDrawer = memo(
  ({
    open,
    onClose,
    onAddToCart,
    isAddingToCart,
    cartActionLabel,
    cartActionLoadingLabel,
  }: {
    open: boolean;
    onClose: () => void;
    onAddToCart: () => void;
    isAddingToCart: boolean;
    cartActionLabel: string;
    cartActionLoadingLabel: string;
  }) => {
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
      serialize,
    } = useGiState();

    const panelRef = useDrawerDialog(open, onClose);

    // Same row construction as the live site's PriceSidebar.
    const details = useMemo<
      Record<GiPart, Array<{ label: string; value: string }>>
    >(
      () => ({
        jacket: [
          { label: 'Size', value: kimonoSize },
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
            value: formatUsd(ADD_ON_PRICE),
          })),
        ],
        belt: [
          { label: 'Size', value: beltSize },
          {
            label: 'Belt Color',
            value: nameForBeltHex(partColors.belt) ?? partColors.belt,
          },
          // Font/thread rows only make sense once that end HAS text.
          { label: 'Left text', value: textPrice(beltEmbroidery.leftEnd) },
          ...(beltEmbroidery.leftEnd.trim()
            ? [
                { label: 'Left font', value: beltEmbroidery.leftFont },
                {
                  label: 'Left color',
                  value: colorName(beltEmbroidery.leftThreadColor),
                },
              ]
            : []),
          { label: 'Right text', value: textPrice(beltEmbroidery.rightEnd) },
          ...(beltEmbroidery.rightEnd.trim()
            ? [
                { label: 'Right font', value: beltEmbroidery.rightFont },
                {
                  label: 'Right color',
                  value: colorName(beltEmbroidery.rightThreadColor),
                },
              ]
            : []),
        ],
        pants: [
          { label: 'Size', value: pantSize },
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
        beltEmbroidery,
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

    if (!open) return null;

    const spec = serialize();

    return (
      <div className="absolute inset-0 z-50">
        {/* Backdrop */}
        <button
          type="button"
          aria-label="Close order summary"
          onClick={onClose}
          className="absolute inset-0 h-full w-full cursor-default bg-black/25"
        />

        {/* Bottom sheet */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Your Gi — order summary"
          tabIndex={-1}
          className="absolute right-0 bottom-0 left-0 flex max-h-[78dvh] flex-col rounded-t-3xl border border-white/40 bg-white/85 shadow-[0_-12px_48px_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150 outline-none"
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-1">
            <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-black">
              Your Gi
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-black/50 transition hover:bg-black/5 hover:text-black"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-3">
            {PART_ORDER.map((part) =>
              !partVisibility[part] ? (
                // Removed part — struck-through header only, like the live
                // site's sidebar.
                <div
                  key={part}
                  className="border-t border-black/10 py-3 first:border-t-0"
                >
                  <span className="text-[12px] font-bold text-black/35 line-through">
                    {GI_PART_DISPLAY[part]}
                  </span>
                </div>
              ) : (
              <div
                key={part}
                className="border-t border-black/10 py-3 first:border-t-0"
              >
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[12px] font-bold text-black">
                    {GI_PART_DISPLAY[part]}
                  </span>
                  <span className="text-[12px] font-semibold text-black">
                    {formatUsd(GI_PART_PRICES[part])}
                  </span>
                </div>
                <div className="flex flex-col gap-[5px]">
                  {details[part].map(({ label, value }) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="min-w-0 truncate text-[10px] text-black/55">
                        {label}
                      </span>
                      <span className="shrink-0 text-right text-[10px] font-medium text-black">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              ),
            )}

            {spec.customSizing ? (
              <div className="border-t border-black/10 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-bold text-black">
                    Custom Sizing
                  </span>
                  <span className="text-[12px] font-semibold text-black">
                    {formatUsd(spec.customSizing.price)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Commit button — same inset margins as the rows */}
          <div className="border-t border-black/10 px-6 pt-3 pb-5">
            <button
              type="button"
              onClick={onAddToCart}
              disabled={isAddingToCart}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black text-[12px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-black/85 disabled:opacity-60"
            >
              {isAddingToCart ? cartActionLoadingLabel : cartActionLabel}
              <span className="text-white/50">·</span>
              {formatUsd(spec.price.total)}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
GiV5CartDrawer.displayName = 'GiV5CartDrawer';
