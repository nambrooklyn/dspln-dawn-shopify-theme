import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  ShopifyCartDrawer,
  sendLinesToShopifyParent,
} from '../shared/shopify-cart-simulator';
import {
  addRashguardTestCartLine,
  buildRashguardCartLine,
  clearRashguardTestCart,
  readRashguardTestCart,
} from '../short-sleeve-rashguard/rashguard-cart';
import type { GarmentViews } from '../short-sleeve-rashguard/rashguard-canvas';
import {
  snapshotCanvas,
  snapshotCanvasCenteredThumbnail,
  snapshotCanvasThumbnail,
} from '../short-sleeve-rashguard/rashguard-export';
import {
  shrinkArtworkDataUrl,
  uploadPreviewImage,
  uploadPreviewImageCached,
} from '../shared/preview-upload';
import {
  buildRashguardCloudDesignUrls,
  getRashguardCloudOwnerContext,
  saveRashguardCloudDesignRecord,
} from '../shared/rashguard-cloud-designs';
import { RASHGUARD_PRODUCT_CONFIG } from '../short-sleeve-rashguard/rashguard-config';
import {
  AUTO_RASHGUARD_DRAFT_ID,
  createDraftArtworkObjectUrls,
  createRashguardDraftDocument,
  readRashguardDraftDocument,
  saveRashguardDraftDocument,
} from '../short-sleeve-rashguard/rashguard-storage';
import {
  RashguardStateProvider,
  useRashguardState,
  type RashguardArtworkLayer,
  type RashguardSerializedState,
} from '../short-sleeve-rashguard/rashguard-state';
import { createLineDesignId } from '../shared/order-flow';
import { V2Shell } from './v2-shell';

/**
 * V2 (minimal / hotspot) short-sleeve rashguard configurator.
 *
 * Same design state, model, pricing, cart, cloud-save and tech-pack pipeline
 * as v1 — every module is IMPORTED from ../short-sleeve-rashguard, so the
 * garment the factory receives is identical. Only the UI shell is new.
 */

const SHOPIFY_CART_ADDED_MESSAGE = 'dspln:shopify-cart:added';
const SHOPIFY_CART_ERROR_MESSAGE = 'dspln:shopify-cart:error';
const AUTO_SAVE_DELAY_MS = 800;
const CART_PREVIEW_CAMERA_SETTLE_MS = 850;

interface RashguardCartConfigData {
  kind: 'rashguard-cart-config';
  spec: RashguardSerializedState;
  artworkLayerUrls?: Record<number, string>;
}

function isRashguardCartConfigData(
  value: unknown,
): value is RashguardCartConfigData {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'rashguard-cart-config' &&
    Boolean((value as { spec?: unknown }).spec)
  );
}

function artworkLayersFromCartConfig(
  configData: RashguardCartConfigData,
): RashguardArtworkLayer[] {
  return configData.spec.artworkLayers.reduce<RashguardArtworkLayer[]>(
    (layers, layer, index) => {
      const imageUrl = configData.artworkLayerUrls?.[index];
      if (layer.kind !== 'image' || !imageUrl) return layers;

      layers.push({
        ...layer,
        kind: 'image',
        imageUrl,
        file: undefined,
        locked: layer.locked ?? false,
        placementPending: false,
      });
      return layers;
    },
    [],
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  }).then((dataUrl) => (dataUrl ? shrinkArtworkDataUrl(dataUrl) : dataUrl));
}

async function imageUrlToDataUrl(url: string) {
  if (url.startsWith('data:image/')) return url;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return fileToDataUrl(
      new File([blob], 'rashguard-artwork.png', { type: blob.type }),
    );
  } catch {
    return null;
  }
}

function getLinkedDesignId() {
  if (typeof window === 'undefined') return null;
  const ownDesignId = new URLSearchParams(window.location.search).get('design');
  if (ownDesignId) return ownDesignId;

  try {
    return new URL(document.referrer).searchParams.get('design');
  } catch {
    return null;
  }
}

function getCartEditMode() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'cart-edit' && Boolean(params.get('cart_line'));
}

function captureGarmentViewsSafe(): GarmentViews | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as unknown as Record<string, unknown>)
    .__rashguardCaptureViews as (() => GarmentViews | null) | undefined;
  try {
    return fn?.() ?? null;
  } catch (err) {
    console.error('[V2 ArtFile] view capture failed', err);
    return null;
  }
}

const V2ConfiguratorInner = memo(() => {
  const {
    artworkLayers,
    getCanvasEl,
    hydrate,
    serialize,
    setCameraView,
  } = useRashguardState();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartLines, setCartLines] = useState(() => readRashguardTestCart());
  const [cloudOwnerContext] = useState(() =>
    getRashguardCloudOwnerContext(RASHGUARD_PRODUCT_CONFIG),
  );
  const [isCartEditMode] = useState(getCartEditMode);
  const draftReadyRef = useRef(false);

  // Hydrate: cart-edit messages from the Shopify parent + shared design links.
  useEffect(() => {
    const handleShopifyCartResult = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'dspln:cart-design:hydrate') {
        const configData = data.configData as
          | RashguardSerializedState
          | RashguardCartConfigData
          | undefined;
        const spec = isRashguardCartConfigData(configData)
          ? configData.spec
          : configData;
        if (!spec?.partColors || !Array.isArray(spec.artworkLayers)) return;
        const draftArtworkImages =
          typeof data.designId === 'string'
            ? createDraftArtworkObjectUrls(
                readRashguardDraftDocument(data.designId) ?? {
                  id: data.designId,
                  name: '',
                  spec,
                  images: [],
                  createdAt: '',
                  updatedAt: '',
                },
              )
            : undefined;
        const cartArtworkImages = isRashguardCartConfigData(configData)
          ? artworkLayersFromCartConfig(configData)
          : [];
        hydrate(
          spec,
          cartArtworkImages.length ? cartArtworkImages : draftArtworkImages,
        );
        return;
      }

      if (data.type === SHOPIFY_CART_ADDED_MESSAGE) {
        toast.success('Added to Shopify cart');
      }

      if (data.type === SHOPIFY_CART_ERROR_MESSAGE) {
        toast.error('Shopify cart did not add the rashguard', {
          description:
            typeof data.message === 'string'
              ? data.message
              : 'The parent Shopify page rejected the cart request.',
        });
      }
    };

    window.addEventListener('message', handleShopifyCartResult);
    return () => window.removeEventListener('message', handleShopifyCartResult);
  }, [hydrate]);

  // Initial load: a ?design= link (cloud record) or the local autosave.
  useEffect(() => {
    const linkedDesignId = getLinkedDesignId();
    const linkedDraft = linkedDesignId
      ? readRashguardDraftDocument(linkedDesignId)
      : null;
    const autoDraft = readRashguardDraftDocument(AUTO_RASHGUARD_DRAFT_ID);

    if (linkedDraft) {
      hydrate(linkedDraft.spec, createDraftArtworkObjectUrls(linkedDraft));
    } else if (linkedDesignId) {
      void (async () => {
        try {
          const url = new URL('/api/customer-designs', window.location.origin);
          url.searchParams.set('id', linkedDesignId);
          const response = await fetch(url, {
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) return;
          const payload = (await response.json()) as {
            data?: {
              design?: {
                configData?: {
                  spec?: RashguardSerializedState;
                  images?: Parameters<
                    typeof createDraftArtworkObjectUrls
                  >[0]['images'];
                };
              };
            };
          };
          const design = payload.data?.design;
          const spec = design?.configData?.spec;
          if (!design || !spec) return;
          hydrate(
            spec,
            createDraftArtworkObjectUrls({
              id: linkedDesignId,
              name: '',
              spec,
              images: design.configData?.images ?? [],
              createdAt: '',
              updatedAt: '',
            }),
          );
        } catch {
          // Leave the default state.
        }
      })();
    } else if (autoDraft) {
      hydrate(autoDraft.spec, createDraftArtworkObjectUrls(autoDraft));
    }

    draftReadyRef.current = true;
  }, [hydrate]);

  // Autosave — same draft record v1 reads, so switching shells keeps the design.
  useEffect(() => {
    if (!draftReadyRef.current) return;

    const timeout = window.setTimeout(async () => {
      try {
        const existing = readRashguardDraftDocument(AUTO_RASHGUARD_DRAFT_ID);
        const draft = await createRashguardDraftDocument({
          id: AUTO_RASHGUARD_DRAFT_ID,
          name: 'Autosaved Rashguard Draft',
          spec: serialize(),
          artworkLayers,
          existingCreatedAt: existing?.createdAt,
        });
        saveRashguardDraftDocument(draft);
      } catch {
        // Autosave is best-effort.
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [artworkLayers, serialize]);

  const uploadArtworkLayerUrls = useCallback(async () => {
    const artworkLayerUrls: Record<number, string> = {};

    await Promise.all(
      artworkLayers.map(async (layer, index) => {
        if (layer.kind !== 'image' || (!layer.file && !layer.imageUrl)) {
          return;
        }

        const dataUrl = layer.file
          ? await fileToDataUrl(layer.file)
          : layer.imageUrl
            ? await imageUrlToDataUrl(layer.imageUrl)
            : null;
        if (!dataUrl) return;

        const hostedUrl = await uploadPreviewImageCached(dataUrl);
        const fallbackUrl = layer.imageUrl?.startsWith('http')
          ? layer.imageUrl
          : dataUrl;
        const artworkUrl = hostedUrl ?? fallbackUrl;
        if (artworkUrl) artworkLayerUrls[index] = artworkUrl;
      }),
    );

    return artworkLayerUrls;
  }, [artworkLayers]);

  // Full v1 add-to-cart flow: camera settle → thumbnail → cloud design record
  // (tech pack + 3D design links) → cart line to the Shopify parent.
  const handleAddToCart = useCallback(async () => {
    setIsAddingToCart(true);
    try {
      const spec = serialize();
      setCameraView('front');
      await new Promise((resolve) =>
        setTimeout(resolve, CART_PREVIEW_CAMERA_SETTLE_MS),
      );
      const localThumbnailUrl =
        snapshotCanvasCenteredThumbnail(getCanvasEl()) ??
        snapshotCanvasThumbnail(getCanvasEl()) ??
        snapshotCanvas(getCanvasEl()) ??
        '';
      const hostedThumbnailUrl = localThumbnailUrl
        ? await uploadPreviewImage(localThumbnailUrl)
        : null;
      const thumbnailUrl = hostedThumbnailUrl ?? localThumbnailUrl;
      const artworkLayerUrls = await uploadArtworkLayerUrls();
      const captured = captureGarmentViewsSafe();
      const renders = captured
        ? { ...captured.views, aspect: captured.aspect }
        : undefined;
      let lineDesignId = createLineDesignId(
        RASHGUARD_PRODUCT_CONFIG.orderDesignIdPrefix,
      );
      let designUrl: string | undefined;
      let productionUrl: string | undefined;

      try {
        const draft = await createRashguardDraftDocument({
          id: lineDesignId,
          name: RASHGUARD_PRODUCT_CONFIG.designNamePrefix,
          spec,
          artworkLayers,
          renders,
          thumbnailUrl,
        });
        const cloudResult = await saveRashguardCloudDesignRecord(
          draft,
          cloudOwnerContext,
          RASHGUARD_PRODUCT_CONFIG,
        );
        if (!cloudResult) {
          throw new Error('Design record was not saved.');
        }
        lineDesignId = cloudResult.draft.id;
        const urls = buildRashguardCloudDesignUrls(
          cloudResult.draft.id,
          RASHGUARD_PRODUCT_CONFIG,
        );
        designUrl = cloudResult.designUrl ?? urls?.designUrl;
        productionUrl = cloudResult.productionUrl ?? urls?.productionUrl;
      } catch (err) {
        // Do NOT sell a design we can't reproduce (matches v1 behavior).
        console.error('[V2Configurator] cloud design save failed', err);
        toast.error('Could not save the production design', {
          description:
            'The item was not added to cart because the Tech Pack and 3D Design links would not work.',
        });
        return;
      }

      const line = buildRashguardCartLine({
        spec,
        thumbnailUrl,
        designId: lineDesignId,
        designUrl,
        productionUrl,
        artworkLayerUrls,
      });
      const sentToShopifyParent = sendLinesToShopifyParent([line]);

      if (sentToShopifyParent) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return;
      }

      const nextCart = addRashguardTestCartLine(line);
      setCartLines(nextCart);
      setCartOpen(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      setIsAddingToCart(false);
    }
  }, [
    artworkLayers,
    cloudOwnerContext,
    getCanvasEl,
    serialize,
    setCameraView,
    uploadArtworkLayerUrls,
  ]);

  return (
    <>
      <V2Shell
        onAddToCart={handleAddToCart}
        isAddingToCart={isAddingToCart}
        cartActionLabel={isCartEditMode ? 'Update Cart' : 'Add to Cart'}
        cartActionLoadingLabel={isCartEditMode ? 'Updating…' : 'Adding…'}
      />
      <ShopifyCartDrawer
        open={cartOpen}
        cartLines={cartLines}
        onClose={() => setCartOpen(false)}
        onClear={() => {
          clearRashguardTestCart();
          setCartLines([]);
        }}
      />
    </>
  );
});

V2ConfiguratorInner.displayName = 'V2ConfiguratorInner';

export const ShortSleeveRashguardV2Configurator = memo(() => (
  <RashguardStateProvider>
    <V2ConfiguratorInner />
  </RashguardStateProvider>
));

ShortSleeveRashguardV2Configurator.displayName =
  'ShortSleeveRashguardV2Configurator';
