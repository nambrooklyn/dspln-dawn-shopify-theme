import { memo, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

import type { GiSerializedState } from './gi-state';
import type { GiPart } from './gi-config';
import { createLineDesignId, productionTechPackUrl } from '../shared/order-flow';
import { GI_PRODUCT_CONFIGS } from '../shared/gi-product-config';

const PRODUCT_CONFIG = GI_PRODUCT_CONFIGS.kids;

const CART_STORAGE_KEY = PRODUCT_CONFIG.testCartStorageKey;
const CONFIG_STORAGE_PREFIX = PRODUCT_CONFIG.configStoragePrefix;
const SHOPIFY_CART_ADD_MESSAGE = 'dspln:shopify-cart:add';
const SHOPIFY_CART_UPDATE_MESSAGE = 'dspln:shopify-cart:update';

type ShopifyChargeVariantKey =
  | 'kimono'
  | 'belt'
  | 'pant'
  | 'logo10'
  | 'backLogo25'
  | 'beltText10';

interface CartProperty {
  name: string;
  value: string;
  hidden?: boolean;
}

export interface ShopifyArtworkLink {
  part: 'kimono' | 'pant';
  slot: string;
  filename: string;
  url: string;
}

interface ShopifyCartCharge {
  key: string;
  label: string;
  variantKey: ShopifyChargeVariantKey;
  quantity: number;
  unitPrice: number;
  properties: CartProperty[];
}

export interface ShopifyCartLine {
  id: string;
  productTitle: string;
  variantTitle: string;
  quantity: number;
  unitPrice: number;
  thumbnailUrl: string;
  configData?: unknown;
  properties: CartProperty[];
  charges: ShopifyCartCharge[];
  createdAt: string;
}

const PART_CHARGE: Record<
  GiPart,
  { label: string; variantKey: ShopifyChargeVariantKey }
> = {
  jacket: { label: 'Kimono', variantKey: 'kimono' },
  belt: { label: 'Belt', variantKey: 'belt' },
  pants: { label: 'Pant', variantKey: 'pant' },
};

function colorValue(color: { name: string | null; hex: string }) {
  return color.name ?? color.hex;
}

function logoYesNo(filename?: string) {
  return filename ? 'YES' : 'NO';
}

function buildOrderDetailProperties(spec: GiSerializedState): CartProperty[] {
  return [
    { name: 'Kimono Size', value: spec.kimono.size },
    { name: 'Kimono Body Color', value: colorValue(spec.kimono.colors.body) },
    { name: 'Kimono Lapel Color', value: colorValue(spec.kimono.colors.lapel) },
    {
      name: 'Kimono Reinforcements Color',
      value: colorValue(spec.kimono.colors.reinforcement),
    },
    {
      name: 'Kimono Stitching Color',
      value: colorValue(spec.kimono.colors.stitching),
    },
    {
      name: 'Kimono Left Chest Logo',
      value: logoYesNo(spec.kimono.logos['left-chest']?.filename),
    },
    {
      name: 'Kimono Left Sleeve Logo',
      value: logoYesNo(spec.kimono.logos['left-sleeve']?.filename),
    },
    {
      name: 'Kimono Right Sleeve Logo',
      value: logoYesNo(spec.kimono.logos['right-sleeve']?.filename),
    },
    { name: 'Kimono Back Logo', value: logoYesNo(spec.kimono.logos.back?.filename) },
    { name: 'Belt Size', value: spec.belt.size },
    { name: 'Belt Color', value: spec.belt.rank.name || colorValue(spec.belt.color) },
    { name: 'Belt Left Text', value: spec.belt.embroidery.leftEnd.trim() || 'NO' },
    { name: 'Belt Left Font', value: spec.belt.embroidery.leftFont },
    {
      name: 'Belt Left Thread Color',
      value:
        spec.belt.embroidery.leftThreadColorName ||
        spec.belt.embroidery.leftThreadColor,
    },
    { name: 'Belt Right Text', value: spec.belt.embroidery.rightEnd.trim() || 'NO' },
    { name: 'Belt Right Font', value: spec.belt.embroidery.rightFont },
    {
      name: 'Belt Right Thread Color',
      value:
        spec.belt.embroidery.rightThreadColorName ||
        spec.belt.embroidery.rightThreadColor,
    },
    { name: 'Pant Size', value: spec.pant.size },
    { name: 'Pant Body Color', value: colorValue(spec.pant.colors.body) },
    {
      name: 'Pant Reinforcements Color',
      value: colorValue(spec.pant.colors.reinforcement),
    },
    {
      name: 'Pant Stitching Color',
      value: colorValue(spec.pant.colors.stitching),
    },
    { name: 'Pant Drawcord Color', value: colorValue(spec.pant.colors.drawcord) },
    {
      name: 'Pant Left Thigh Logo',
      value: logoYesNo(spec.pant.logos['left-pant']?.filename),
    },
    {
      name: 'Pant Right Thigh Logo',
      value: logoYesNo(spec.pant.logos['right-pant']?.filename),
    },
  ];
}

function formatArtworkLabel(link: ShopifyArtworkLink) {
  const slotLabels: Record<string, string> = {
    'left-chest': 'Left Chest Artwork',
    'left-sleeve': 'Left Sleeve Artwork',
    'right-sleeve': 'Right Sleeve Artwork',
    back: 'Back Artwork',
    'left-pant': 'Left Thigh Artwork',
    'right-pant': 'Right Thigh Artwork',
  };

  return slotLabels[link.slot] ?? `${link.part} ${link.slot} Artwork`;
}

function calculateConfiguredTotal(spec: GiSerializedState) {
  const baseTotal = spec.price.lines.reduce(
    (sum, line) => sum + (line.included ? line.unitPrice : 0),
    0,
  );
  const kimonoLogoTotal = Object.entries(spec.kimono.logos).reduce(
    (sum, [slot, logo]) => {
      if (!logo) return sum;
      return sum + (slot === 'back' ? 25 : 10);
    },
    0,
  );
  const pantLogoTotal =
    Object.values(spec.pant.logos).filter(Boolean).length * 10;
  const beltTextTotal =
    (spec.belt.embroidery.leftEnd.trim() ? 10 : 0) +
    (spec.belt.embroidery.rightEnd.trim() ? 10 : 0);

  return (
    baseTotal +
    (spec.partVisibility.jacket ? kimonoLogoTotal : 0) +
    (spec.partVisibility.pants ? pantLogoTotal : 0) +
    (spec.partVisibility.belt ? beltTextTotal : 0)
  );
}

function buildSummary(spec: GiSerializedState) {
  const kimonoColor = colorValue(spec.kimono.colors.body);
  const pantColor = colorValue(spec.pant.colors.body);
  return `Kids Kimono ${spec.kimono.size} / ${kimonoColor} / Belt ${spec.belt.size} ${spec.belt.rank.name} / Pant ${spec.pant.size} / ${pantColor}`;
}

function buildChargeProperties({
  configuratorId,
  label,
  summary,
}: {
  configuratorId: string;
  label: string;
  summary: string;
}): CartProperty[] {
  return [
    { name: 'Charge', value: label },
    { name: '_dspln_line_role', value: 'custom_charge', hidden: true },
    { name: '_dspln_design_id', value: configuratorId, hidden: true },
    { name: '_dspln_configurator_id', value: configuratorId, hidden: true },
    { name: '_dspln_parent_summary', value: summary, hidden: true },
  ];
}

function buildShopifyCharges({
  spec,
  configuratorId,
  summary,
}: {
  spec: GiSerializedState;
  configuratorId: string;
  summary: string;
}): ShopifyCartCharge[] {
  const charges: ShopifyCartCharge[] = [];

  spec.price.lines.forEach((line) => {
    if (!line.included) return;
    const charge = PART_CHARGE[line.part];
    charges.push({
      key: `${configuratorId}-${line.part}`,
      label: charge.label,
      variantKey: charge.variantKey,
      quantity: 1,
      unitPrice: line.unitPrice,
      properties: buildChargeProperties({
        configuratorId,
        label: charge.label,
        summary,
      }),
    });
  });

  if (spec.partVisibility.jacket) {
    Object.entries(spec.kimono.logos).forEach(([slot, logo]) => {
      if (!logo) return;
      const isBackLogo = slot === 'back';
      const label = isBackLogo
        ? 'Big Logo on Back'
        : slot === 'left-chest'
          ? 'Logo on Left Chest'
          : slot === 'left-sleeve'
            ? 'Logo on Left Sleeve'
            : 'Logo on Right Sleeve';
      charges.push({
        key: `${configuratorId}-kimono-${slot}`,
        label,
        variantKey: isBackLogo ? 'backLogo25' : 'logo10',
        quantity: 1,
        unitPrice: isBackLogo ? 25 : 10,
        properties: buildChargeProperties({
          configuratorId,
          label,
          summary,
        }),
      });
    });
  }

  if (spec.partVisibility.pants) {
    Object.entries(spec.pant.logos).forEach(([slot, logo]) => {
      if (!logo) return;
      const label =
        slot === 'left-pant' ? 'Logo on Left Thigh' : 'Logo on Right Thigh';
      charges.push({
        key: `${configuratorId}-pant-${slot}`,
        label,
        variantKey: 'logo10',
        quantity: 1,
        unitPrice: 10,
        properties: buildChargeProperties({
          configuratorId,
          label,
          summary,
        }),
      });
    });
  }

  if (spec.partVisibility.belt) {
    [
      ['left', spec.belt.embroidery.leftEnd.trim()] as const,
      ['right', spec.belt.embroidery.rightEnd.trim()] as const,
    ].forEach(([side, text]) => {
      if (!text) return;
      const label = side === 'left' ? 'Left Belt Text' : 'Right Belt Text';
      charges.push({
        key: `${configuratorId}-belt-${side}-text`,
        label,
        variantKey: 'beltText10',
        quantity: 1,
        unitPrice: 10,
        properties: buildChargeProperties({
          configuratorId,
          label,
          summary,
        }),
      });
    });
  }

  return charges;
}

export function buildShopifyTestCartLine({
  spec,
  thumbnailUrl,
  designId,
  designUrl,
  productionUrl,
  artworkLinks,
  configData,
}: {
  spec: GiSerializedState;
  thumbnailUrl: string;
  designId?: string;
  designUrl?: string;
  productionUrl?: string;
  artworkLinks?: ShopifyArtworkLink[];
  configData?: unknown;
}): ShopifyCartLine {
  const configuratorId =
    designId ?? createLineDesignId(PRODUCT_CONFIG.orderDesignIdPrefix);
  const configStorageKey = `${CONFIG_STORAGE_PREFIX}${configuratorId}`;
  const total = calculateConfiguredTotal(spec);
  const summary = buildSummary(spec);
  const techPackUrl = productionTechPackUrl(productionUrl);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(configStorageKey, JSON.stringify(spec));
  }

  const properties: CartProperty[] = [
    ...buildOrderDetailProperties(spec),
    { name: '_dspln_line_role', value: 'configured_design', hidden: true },
    { name: '_dspln_design_id', value: configuratorId, hidden: true },
    { name: '_configurator_id', value: configuratorId, hidden: true },
    { name: '_config_json_storage_key', value: configStorageKey, hidden: true },
    { name: '_preview_image_url', value: thumbnailUrl, hidden: true },
    ...(designUrl ? [{ name: '3D Design', value: designUrl }] : []),
    ...(techPackUrl ? [{ name: 'Tech Pack', value: techPackUrl }] : []),
    ...(productionUrl ? [{ name: 'Production URL', value: productionUrl }] : []),
    ...(designUrl ? [{ name: '_dspln_design_url', value: designUrl, hidden: true }] : []),
    ...(productionUrl
      ? [{ name: '_dspln_production_url', value: productionUrl, hidden: true }]
      : []),
    ...((artworkLinks ?? []).map((link) => ({
      name: formatArtworkLabel(link),
      value: link.url,
      hidden: true,
    }))),
  ];

  return {
    id: configuratorId,
    productTitle: PRODUCT_CONFIG.productTitle,
    variantTitle: 'Custom Design',
    quantity: 1,
    unitPrice: total,
    thumbnailUrl,
    configData: configData ?? spec,
    properties,
    charges: buildShopifyCharges({ spec, configuratorId, summary }),
    createdAt: new Date().toISOString(),
  };
}

export function addShopifyTestCartLine(line: ShopifyCartLine) {
  if (typeof window === 'undefined') return [line];
  const current = readShopifyTestCart();
  const next = [line, ...current];
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function readShopifyTestCart(): ShopifyCartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cartPropertiesForShopify(line: ShopifyCartLine) {
  return line.properties.reduce<Record<string, string>>((acc, property) => {
    // This test build stores the preview as a local data URL. Shopify line
    // properties should stay compact; production will pass a real hosted URL.
    if (
      property.name === '_preview_image_url' &&
      property.value.startsWith('data:')
    ) {
      return acc;
    }
    if (
      property.hidden &&
      ![
        '_dspln_design_id',
        '_dspln_design_url',
        '_preview_image_url',
      ].includes(property.name)
    ) {
      return acc;
    }
    acc[property.name] = property.value;
    return acc;
  }, {});
}

export function sendLinesToShopifyParent(lines: ShopifyCartLine[]) {
  if (typeof window === 'undefined' || window.parent === window) {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  const cartLineKey = params.get('cart_line') || '';
  const isCartEdit = params.get('mode') === 'cart-edit' && cartLineKey !== '';

  window.parent.postMessage(
    {
      type: isCartEdit ? SHOPIFY_CART_UPDATE_MESSAGE : SHOPIFY_CART_ADD_MESSAGE,
      ...(isCartEdit ? { cartLineKey } : {}),
      configuredLines: lines.map((line) => ({
        id: line.id,
        quantity: line.quantity,
        configuredTotal: line.unitPrice,
        previewImageUrl: line.thumbnailUrl,
        configData: line.configData,
        main: {
          quantity: line.quantity,
          properties: cartPropertiesForShopify(line),
        },
        charges: (line.charges ?? []).map((charge) => ({
          key: charge.key,
          label: charge.label,
          variantKey: charge.variantKey,
          quantity: charge.quantity,
          unitPrice: charge.unitPrice,
          properties: charge.properties.reduce<Record<string, string>>(
            (acc, property) => {
              acc[property.name] = property.value;
              return acc;
            },
            {},
          ),
        })),
      })),
    },
    '*',
  );

  return true;
}

export const ShopifyCartDrawer = memo(
  ({
    open,
    cartLines,
    onClose,
    onClear,
  }: {
    open: boolean;
    cartLines: ShopifyCartLine[];
    onClose: () => void;
    onClear: () => void;
  }) => {
    const total = useMemo(
      () =>
        cartLines.reduce(
          (sum, line) => sum + line.unitPrice * line.quantity,
          0,
        ),
      [cartLines],
    );
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [checkoutReady, setCheckoutReady] = useState<
      'idle' | 'sent' | 'local'
    >('idle');

    useEffect(() => {
      if (open && cartLines[0]) {
        setExpandedId(cartLines[0].id);
        setCheckoutReady('idle');
      }
    }, [cartLines, open]);

    if (!open) return null;

    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
        <button
          type="button"
          aria-label="Close cart overlay"
          className="absolute inset-0 cursor-default"
          onClick={onClose}
        />
        <aside className="bg-background relative flex h-full w-[min(26rem,100vw)] flex-col border-l shadow-2xl">
          <div className="border-border flex items-center justify-between border-b px-4 py-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] uppercase">
                Shopping Cart
              </p>
              <p className="text-muted-foreground text-xs">
                Custom gear checkout preview
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cartLines.length === 0 ? (
              <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                No custom gear in the test cart yet.
              </div>
            ) : (
              <ul className="space-y-4">
                {cartLines.map((line) => {
                  const visibleProperties = line.properties.filter(
                    (property) => !property.hidden,
                  );
                  const hiddenProperties = line.properties.filter(
                    (property) => property.hidden,
                  );
                  const isExpanded = expandedId === line.id;
                  return (
                    <li
                      key={line.id}
                      className="border-border rounded-lg border p-3"
                    >
                      <div className="flex gap-3">
                        <div className="bg-muted h-24 w-20 shrink-0 overflow-hidden rounded border">
                          {line.thumbnailUrl ? (
                            <img
                              src={line.thumbnailUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {line.productTitle}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {line.variantTitle}
                              </p>
                            </div>
                            <p className="text-sm font-semibold">
                              ${line.unitPrice.toFixed(2)}
                            </p>
                          </div>
                          <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">
                            {
                              visibleProperties.find(
                                (property) => property.name === 'Summary',
                              )?.value
                            }
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : line.id)
                        }
                        className="text-foreground mt-3 text-xs font-semibold underline-offset-4 hover:underline"
                      >
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>

                      {isExpanded ? (
                        <div className="mt-3 space-y-3">
                          <dl className="space-y-2">
                            {visibleProperties.map((property) => (
                              <div
                                key={property.name}
                                className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-xs"
                              >
                                <dt className="text-muted-foreground">
                                  {property.name}
                                </dt>
                                <dd className="text-foreground min-w-0">
                                  {property.value}
                                </dd>
                              </div>
                            ))}
                          </dl>

                          <details className="border-border rounded border p-2">
                            <summary className="cursor-pointer text-xs font-semibold">
                              Hidden production properties
                            </summary>
                            <dl className="mt-2 space-y-2">
                              {hiddenProperties.map((property) => (
                                <div
                                  key={property.name}
                                  className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2 text-[11px]"
                                >
                                  <dt className="text-muted-foreground">
                                    {property.name}
                                  </dt>
                                  <dd className="min-w-0 truncate font-mono">
                                    {property.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-border border-t p-4">
            {checkoutReady !== 'idle' ? (
              <div
                role="status"
                className="border-border bg-muted/40 mb-4 rounded-lg border p-3"
              >
                <div className="flex gap-3">
                  <CheckCircle className="text-foreground mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">
                      {checkoutReady === 'sent'
                        ? 'Sent to Shopify cart'
                        : 'Ready for Shopify checkout'}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs leading-5">
                      {checkoutReady === 'sent'
                        ? 'The custom gear payload was sent to the Shopify page. Once the Shopify bridge is installed, it will add this line to the real cart.'
                        : 'This drawer is running locally. In Shopify, the same payload is sent to the page and added through /cart/add.js.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold tracking-[0.18em] uppercase">
                Total
              </span>
              <span className="text-2xl font-semibold">
                ${total.toFixed(2)}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={onClear}>
                Clear cart
              </Button>
              <Button
                onClick={() => {
                  const sent = sendLinesToShopifyParent(cartLines);
                  setCheckoutReady(sent ? 'sent' : 'local');
                }}
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>
      </div>
    );
  },
);

ShopifyCartDrawer.displayName = 'ShopifyCartDrawer';
