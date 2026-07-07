import { RASHGUARD_PRODUCT_CONFIG } from './rashguard-config';
import type { RashguardSerializedState } from './rashguard-state';
import type { ShopifyCartLine } from '../shared/shopify-cart-simulator';
import { createLineDesignId } from '../shared/order-flow';

function colorValue(color: { name: string | null; hex: string }) {
  return color.name ?? color.hex;
}

function buildSummary(spec: RashguardSerializedState) {
  const waistColor = colorValue(spec.partColors.waistband);
  const legColor = colorValue(spec.partColors.rightFrontLeg);
  const artworkCount = spec.artworkLayers.length;
  return `Size ${spec.size} / Waistband ${waistColor} / Legs ${legColor} / ${artworkCount} artwork layer${artworkCount === 1 ? '' : 's'}`;
}

function artworkLayerProperties(spec: RashguardSerializedState) {
  return [{ name: 'Artwork Layers', value: spec.artworkLayers.length ? 'YES' : 'NO' }];
}

function artworkLayerUrlProperties(artworkLayerUrls?: Record<number, string>) {
  if (!artworkLayerUrls) return [];
  return Object.entries(artworkLayerUrls)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([index, url]) => ({
      name: `_dspln_artwork_layer_${Number(index) + 1}_url`,
      value: url,
      hidden: true,
    }));
}

function cartConfigData(
  spec: RashguardSerializedState,
  artworkLayerUrls?: Record<number, string>,
) {
  return {
    kind: 'rashguard-cart-config',
    version: 1,
    spec,
    artworkLayerUrls: artworkLayerUrls ?? {},
  };
}

export function buildRashguardCartLine({
  spec,
  thumbnailUrl,
  designId,
  artworkLayerUrls,
}: {
  spec: RashguardSerializedState;
  thumbnailUrl: string;
  designId?: string;
  artworkLayerUrls?: Record<number, string>;
}): ShopifyCartLine {
  const configuratorId =
    designId ?? createLineDesignId(RASHGUARD_PRODUCT_CONFIG.orderDesignIdPrefix);
  const configStorageKey = `${RASHGUARD_PRODUCT_CONFIG.configStoragePrefix}${configuratorId}`;
  const summary = buildSummary(spec);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(configStorageKey, JSON.stringify(spec));
  }

  return {
    id: configuratorId,
    productTitle: RASHGUARD_PRODUCT_CONFIG.productTitle,
    variantTitle: 'Custom Design',
    quantity: 1,
    unitPrice: spec.price.total,
    thumbnailUrl,
    configData: cartConfigData(spec, artworkLayerUrls),
    properties: [
      { name: 'Grappling Short Size', value: spec.size },
      { name: 'Waistband Color', value: colorValue(spec.partColors.waistband) },
      { name: 'Right Front Leg Color', value: colorValue(spec.partColors.rightFrontLeg) },
      { name: 'Left Front Leg Color', value: colorValue(spec.partColors.leftFrontLeg) },
      { name: 'Right Back Leg Color', value: colorValue(spec.partColors.rightBackLeg) },
      { name: 'Left Back Leg Color', value: colorValue(spec.partColors.leftBackLeg) },
      { name: 'Stitching Color', value: colorValue(spec.partColors.stitching) },
      ...artworkLayerProperties(spec),
      { name: '_dspln_parent_summary', value: summary, hidden: true },
      { name: '_dspln_line_role', value: 'configured_design', hidden: true },
      { name: '_dspln_design_id', value: configuratorId, hidden: true },
      { name: '_configurator_id', value: configuratorId, hidden: true },
      { name: '_config_json_storage_key', value: configStorageKey, hidden: true },
      { name: '_preview_image_url', value: thumbnailUrl, hidden: true },
      ...artworkLayerUrlProperties(artworkLayerUrls),
    ],
    charges: [],
    createdAt: new Date().toISOString(),
  };
}

export function readRashguardTestCart(): ShopifyCartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RASHGUARD_PRODUCT_CONFIG.cartStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRashguardTestCartLine(line: ShopifyCartLine) {
  if (typeof window === 'undefined') return [line];
  const next = [line, ...readRashguardTestCart()];
  window.localStorage.setItem(
    RASHGUARD_PRODUCT_CONFIG.cartStorageKey,
    JSON.stringify(next),
  );
  return next;
}

export function clearRashguardTestCart() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(RASHGUARD_PRODUCT_CONFIG.cartStorageKey);
}
