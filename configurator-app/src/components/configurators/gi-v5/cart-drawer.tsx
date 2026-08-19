import { memo } from 'react';
import { X } from 'lucide-react';

import {
  GI_PART_DISPLAY,
  KIMONO_LOGO_SLOT_LABEL,
  PANT_LOGO_SLOT_LABEL,
  type KimonoLogoSlot,
  type PantLogoSlot,
} from '../gi/gi-config';
import { useGiState } from '../gi/gi-state';

/**
 * Order-summary drawer: tapping the bag opens this instead of adding to
 * cart immediately. It lists every included part with its current
 * customization (size, zone colors, logos, embroidery), then a full-width
 * ADD TO CART button at the bottom commits the order.
 */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-black/45">
        {label}
      </span>
      <span className="truncate text-right text-[11px] text-black">
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  price,
  children,
}: {
  title: string;
  price: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-black/10 py-3 first:border-t-0">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-black">
          {title}
        </span>
        <span className="text-[11px] font-semibold text-black/60">
          ${price}
        </span>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
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
    const { serialize } = useGiState();
    if (!open) return null;

    const spec = serialize();
    const colorName = (zone: { hex: string; name: string | null }) =>
      zone.name ?? zone.hex.toUpperCase();
    const partPrice = (part: 'jacket' | 'belt' | 'pants') =>
      spec.price.lines.find((line) => line.part === part)?.unitPrice ?? 0;

    const kimonoLogoRows = Object.entries(spec.kimono.logos) as Array<
      [KimonoLogoSlot, { filename: string }]
    >;
    const pantLogoRows = Object.entries(spec.pant.logos) as Array<
      [PantLogoSlot, { filename: string }]
    >;

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
        <div className="absolute right-0 bottom-0 left-0 flex max-h-[78dvh] flex-col rounded-t-3xl border border-white/40 bg-white/80 shadow-[0_-12px_48px_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150">
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
            {spec.partVisibility.jacket ? (
              <Section
                title={GI_PART_DISPLAY.jacket}
                price={partPrice('jacket')}
              >
                <Row label="Size" value={spec.kimono.size || 'Not selected'} />
                <Row label="Body" value={colorName(spec.kimono.colors.body)} />
                <Row
                  label="Lapel"
                  value={colorName(spec.kimono.colors.lapel)}
                />
                <Row
                  label="Inside"
                  value={colorName(spec.kimono.colors.reinforcement)}
                />
                <Row
                  label="Stitch"
                  value={colorName(spec.kimono.colors.stitching)}
                />
                {kimonoLogoRows.map(([slot, logo]) => (
                  <Row
                    key={slot}
                    label={KIMONO_LOGO_SLOT_LABEL[slot]}
                    value={logo.filename}
                  />
                ))}
              </Section>
            ) : null}

            {spec.partVisibility.belt ? (
              <Section title={GI_PART_DISPLAY.belt} price={partPrice('belt')}>
                <Row label="Size" value={spec.belt.size || 'Not selected'} />
                <Row label="Color" value={colorName(spec.belt.color)} />
                {spec.belt.embroidery.leftEnd ? (
                  <Row
                    label="Left End Text"
                    value={`“${spec.belt.embroidery.leftEnd}” · ${
                      spec.belt.embroidery.leftThreadColorName ?? ''
                    }`}
                  />
                ) : null}
                {spec.belt.embroidery.rightEnd ? (
                  <Row
                    label="Right End Text"
                    value={`“${spec.belt.embroidery.rightEnd}” · ${
                      spec.belt.embroidery.rightThreadColorName ?? ''
                    }`}
                  />
                ) : null}
              </Section>
            ) : null}

            {spec.partVisibility.pants ? (
              <Section title={GI_PART_DISPLAY.pants} price={partPrice('pants')}>
                <Row label="Size" value={spec.pant.size || 'Not selected'} />
                <Row label="Body" value={colorName(spec.pant.colors.body)} />
                <Row
                  label="Reinf"
                  value={colorName(spec.pant.colors.reinforcement)}
                />
                <Row
                  label="Stitch"
                  value={colorName(spec.pant.colors.stitching)}
                />
                <Row
                  label="Cord"
                  value={colorName(spec.pant.colors.drawcord)}
                />
                {pantLogoRows.map(([slot, logo]) => (
                  <Row
                    key={slot}
                    label={PANT_LOGO_SLOT_LABEL[slot]}
                    value={logo.filename}
                  />
                ))}
              </Section>
            ) : null}

            {spec.customSizing ? (
              <Section title="Custom Sizing" price={spec.customSizing.price}>
                <Row
                  label="Notes"
                  value={spec.customSizing.notes || 'To be provided'}
                />
              </Section>
            ) : null}
          </div>

          {/* Full-width commit button */}
          <div className="border-t border-black/10 px-5 pt-3 pb-5">
            <button
              type="button"
              onClick={onAddToCart}
              disabled={isAddingToCart}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black text-[12px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-black/85 disabled:opacity-60"
            >
              {isAddingToCart ? cartActionLoadingLabel : cartActionLabel}
              <span className="text-white/50">·</span>${spec.price.total}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
GiV5CartDrawer.displayName = 'GiV5CartDrawer';
