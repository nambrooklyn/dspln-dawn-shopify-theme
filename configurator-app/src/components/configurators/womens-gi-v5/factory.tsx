import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { toast } from 'sonner';

import { GiStateProvider, useGiState } from '../womens-gi/gi-state';
import type { GiSerializedState } from '../womens-gi/gi-state';
import type { CameraView } from '../womens-gi/gi-config';
import {
  AUTO_GI_DRAFT_ID,
  createDraftLogoObjectUrls,
  createGiDraftDocument,
  listSavedGiDesigns,
  readGiDraftDocument,
  saveGiDraftDocument,
  type GiDraftDocument,
  type GiDraftLogoImage,
} from '../womens-gi/gi-draft-storage';
import {
  buildGiCloudDesignUrls,
  getGiCloudDesign,
  getGiCloudOwnerContext,
  saveGiCloudDesignRecord,
  type CloudArtworkLink,
} from '../womens-gi/gi-cloud-designs';
import {
  snapshotCanvas,
  snapshotCanvasCenteredThumbnail,
  snapshotCanvasThumbnail,
} from '../shared/export-pdf';
import { createLineDesignId, getMissingGiSizeMessage } from '../shared/order-flow';
import { uploadPreviewImage } from '../shared/preview-upload';
import {
  addShopifyTestCartLine,
  buildShopifyTestCartLine,
  readShopifyTestCart,
  sendLinesToShopifyParent,
  ShopifyCartDrawer,
  type ShopifyCartLine,
} from '../shared/shopify-cart-simulator';
import { currentGiProductConfig } from '../shared/gi-product-config';
import { listGiCloudDesigns } from '../womens-gi/gi-cloud-designs';
import { UploadedLogosProvider } from '../womens-gi/uploaded-logos-context';
import { useUploadedLogos } from '../womens-gi/use-uploaded-logos';

/**
 * V2 (minimal / hotspot) gi configurator.
 *
 * Same design state, model, pricing, cart, cloud-save and tech-pack pipeline
 * as the v1 gi — every logic module is IMPORTED from ../gi, so the design
 * payload the factory receives is identical. Only the UI shell is new.
 */

const PRODUCT_CONFIG = currentGiProductConfig();
const SHOPIFY_CART_ADDED_MESSAGE = 'dspln:shopify-cart:added';
const SHOPIFY_CART_UPDATED_MESSAGE = 'dspln:shopify-cart:updated';
const SHOPIFY_CART_ERROR_MESSAGE = 'dspln:shopify-cart:error';
const AUTO_SAVE_DELAY_MS = 800;
const CUSTOMER_DESIGNS_CHANGED_KEY = 'dspln:customer-designs:changed';

interface CartLogoImageData {
  dataUrl: string;
  filename: string;
  imageWidth: number;
  imageHeight: number;
}

interface GiCartConfigData {
  kind: 'gi-cart-config';
  version: 1;
  spec: GiSerializedState;
  images: {
    kimono: Record<string, CartLogoImageData>;
    pant: Record<string, CartLogoImageData>;
  };
}

function formatDesignName() {
  return PRODUCT_CONFIG.designNamePrefix;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function draftImagesToCartImages<TSlot extends string>(
  images: Partial<Record<TSlot, GiDraftLogoImage>>,
) {
  const entries = await Promise.all(
    Object.entries(images).map(async ([slot, image]) => {
      if (!image) return null;
      const draftImage = image as GiDraftLogoImage;
      const dataUrl = await blobToDataUrl(draftImage.blob);
      if (!dataUrl) return null;
      return [
        slot,
        {
          dataUrl,
          filename: draftImage.filename,
          imageWidth: draftImage.imageWidth,
          imageHeight: draftImage.imageHeight,
        },
      ] as const;
    }),
  );

  return entries.reduce<Record<string, CartLogoImageData>>((acc, entry) => {
    if (!entry) return acc;
    const [slot, image] = entry;
    acc[slot] = image;
    return acc;
  }, {});
}

async function draftToCartConfigData(
  draft: GiDraftDocument,
): Promise<GiCartConfigData> {
  return {
    kind: 'gi-cart-config',
    version: 1,
    spec: draft.spec,
    images: {
      kimono: await draftImagesToCartImages(draft.images.kimono),
      pant: await draftImagesToCartImages(draft.images.pant),
    },
  };
}

function cartImagesToLogoImages<TSlot extends string>(
  images: Record<string, CartLogoImageData> | undefined,
) {
  return Object.entries(images ?? {}).reduce<
    Partial<
      Record<
        TSlot,
        {
          imageUrl: string;
          filename: string;
          imageWidth: number;
          imageHeight: number;
        }
      >
    >
  >((acc, [slot, image]) => {
    acc[slot as TSlot] = {
      imageUrl: image.dataUrl,
      filename: image.filename,
      imageWidth: image.imageWidth,
      imageHeight: image.imageHeight,
    };
    return acc;
  }, {});
}

function isGiCartConfigData(value: unknown): value is GiCartConfigData {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'gi-cart-config' &&
    (value as { spec?: { kind?: unknown } }).spec?.kind ===
      PRODUCT_CONFIG.stateKind
  );
}

function broadcastCustomerDesignsChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CUSTOMER_DESIGNS_CHANGED_KEY,
      String(Date.now()),
    );
  } catch {
    // The account dashboard also polls, so this is only a fast refresh signal.
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

/** Props every minimal-shell variant (v2/v3/v4) receives from the base. */
export interface GiMinimalShellProps {
  onAddToCart: () => void;
  isAddingToCart?: boolean;
  cartActionLabel?: string;
  cartActionLoadingLabel?: string;
}

const GiV2ConfiguratorInner = memo(({
  Shell,
  homeView,
}: {
  Shell: ComponentType<GiMinimalShellProps>;
  /** Camera view restored designs land on (default 'front'). */
  homeView?: CameraView;
}) => {
  const { getCanvasEl, serialize, hydrate, kimonoLogos, pantLogos, setCameraView } =
    useGiState();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isCartEditMode] = useState(getCartEditMode);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartLines, setCartLines] = useState<ShopifyCartLine[]>(() =>
    readShopifyTestCart(),
  );
  const [cloudOwnerContext] = useState(() => getGiCloudOwnerContext());
  const [currentDesignName] = useState(formatDesignName);
  const draftReadyRef = useRef(false);

  // The customer's uploaded-artwork library (current design + every saved
  // design, local and cloud) — the logo panels offer these as one-tap
  // re-apply thumbnails.
  const [savedDesigns, setSavedDesigns] = useState<GiDraftDocument[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const [localResult, cloudResult] = await Promise.allSettled([
        listSavedGiDesigns(),
        listGiCloudDesigns(cloudOwnerContext),
      ]);
      if (!active) return;
      const local =
        localResult.status === 'fulfilled' ? localResult.value : [];
      const cloud =
        cloudResult.status === 'fulfilled' ? cloudResult.value : [];
      setSavedDesigns([...local, ...cloud]);
    })();
    return () => {
      active = false;
    };
  }, [cloudOwnerContext]);
  const uploadedLogos = useUploadedLogos({
    savedDesigns,
    currentKimonoLogos: kimonoLogos,
    currentPantLogos: pantLogos,
    defaultDesignName: currentDesignName,
  });

  // Hydrate: cart-edit messages from the Shopify parent.
  useEffect(() => {
    const handleShopifyCartResult = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'dspln:cart-design:hydrate') {
        const configData = data.configData as
          | GiSerializedState
          | GiCartConfigData
          | undefined;
        const spec = isGiCartConfigData(configData)
          ? configData.spec
          : configData;
        if (spec?.kind !== PRODUCT_CONFIG.stateKind) return;

        hydrate(
          spec,
          isGiCartConfigData(configData)
            ? {
                kimono: cartImagesToLogoImages(configData.images.kimono),
                pant: cartImagesToLogoImages(configData.images.pant),
              }
            : undefined,
          homeView,
        );
        return;
      }

      if (data.type === SHOPIFY_CART_ADDED_MESSAGE) {
        toast.success('Added to Shopify cart');
      }
      if (data.type === SHOPIFY_CART_UPDATED_MESSAGE) {
        toast.success('Updated Shopify cart');
      }
      if (data.type === SHOPIFY_CART_ERROR_MESSAGE) {
        toast.error('Shopify cart did not add the gi', {
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

  // Initial load: a ?design= link (cloud → local fallback) or the autosave.
  useEffect(() => {
    let isActive = true;

    async function loadInitialDraft() {
      try {
        const linkedDesignId = getLinkedDesignId();
        const draft = linkedDesignId
          ? await getGiCloudDesign(linkedDesignId)
              .catch(() => null)
              .then(
                (design) =>
                  design ??
                  readGiDraftDocument(linkedDesignId) ??
                  readGiDraftDocument(AUTO_GI_DRAFT_ID),
              )
          : await readGiDraftDocument(AUTO_GI_DRAFT_ID);
        if (!isActive) return;
        if (draft) {
          hydrate(draft.spec, createDraftLogoObjectUrls(draft), homeView);
        }
        draftReadyRef.current = true;
      } catch {
        if (isActive) draftReadyRef.current = true;
      }
    }

    void loadInitialDraft();

    return () => {
      isActive = false;
    };
  }, [hydrate]);

  // Autosave — same draft record the v1 gi reads, so designs carry across.
  useEffect(() => {
    if (!draftReadyRef.current) return;

    const timeout = window.setTimeout(async () => {
      try {
        const existing = await readGiDraftDocument(AUTO_GI_DRAFT_ID);
        const draft = await createGiDraftDocument({
          id: AUTO_GI_DRAFT_ID,
          name: 'Autosaved Gi Draft',
          spec: serialize(),
          kimonoLogos,
          pantLogos,
          existingCreatedAt: existing?.createdAt,
        });
        await saveGiDraftDocument(draft);
      } catch {
        // Autosave is best-effort.
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [kimonoLogos, pantLogos, serialize]);

  // Full v1 add-to-cart flow: size guard → thumbnail → cloud design record
  // (tech pack + 3D design links) → cart line to the Shopify parent.
  const handleAddToCart = useCallback(async () => {
    setIsAddingToCart(true);
    try {
      const spec = serialize();
      const missingSizeMessage = getMissingGiSizeMessage(spec);
      if (missingSizeMessage) {
        toast.error(missingSizeMessage);
        return;
      }

      setCameraView('front');
      await new Promise((r) => setTimeout(r, 700));
      const localThumbnailUrl =
        snapshotCanvasCenteredThumbnail(getCanvasEl()) ??
        snapshotCanvasThumbnail(getCanvasEl()) ??
        snapshotCanvas(getCanvasEl()) ??
        '';
      const hostedThumbnailUrl = localThumbnailUrl
        ? await uploadPreviewImage(localThumbnailUrl)
        : null;
      const thumbnailUrl = hostedThumbnailUrl ?? localThumbnailUrl;
      let lineDesignId = createLineDesignId(PRODUCT_CONFIG.orderDesignIdPrefix);
      let fallbackUrls = buildGiCloudDesignUrls(lineDesignId);
      let designUrl: string | undefined = fallbackUrls?.designUrl;
      let productionUrl: string | undefined = fallbackUrls?.productionUrl;
      let artworkLinks: CloudArtworkLink[] = [];
      let cartConfigData: GiCartConfigData | undefined;

      try {
        const cartDraft = await createGiDraftDocument({
          id: lineDesignId,
          name: currentDesignName || formatDesignName(),
          spec,
          kimonoLogos,
          pantLogos,
          thumbnailUrl,
        });
        cartConfigData = await draftToCartConfigData(cartDraft);
        const cloudResult = await saveGiCloudDesignRecord(
          cartDraft,
          cloudOwnerContext,
        );
        if (!cloudResult) {
          throw new Error('Design record was not saved.');
        }
        lineDesignId = cloudResult.draft.id;
        broadcastCustomerDesignsChanged();
        fallbackUrls = buildGiCloudDesignUrls(cloudResult.draft.id);
        designUrl = cloudResult.designUrl ?? fallbackUrls?.designUrl;
        productionUrl = cloudResult.productionUrl ?? fallbackUrls?.productionUrl;
        artworkLinks = cloudResult.artwork;
      } catch (err) {
        // Do NOT sell a design we can't reproduce (matches v1 behavior).
        console.error('[GiV2Configurator] cloud design save failed', err);
        toast.error('Could not save the production design', {
          description:
            'The gi was not added to cart because the Tech Pack and 3D Design links would not work.',
        });
        return;
      }

      const line = buildShopifyTestCartLine({
        // The cart-simulator helper is typed against the mens pipeline's
        // serialized state; the womens shape is wire-compatible.
        spec: spec as unknown as Parameters<
          typeof buildShopifyTestCartLine
        >[0]['spec'],
        thumbnailUrl,
        designId: lineDesignId,
        designUrl,
        productionUrl,
        artworkLinks,
        configData: cartConfigData,
      });

      const sentToShopifyParent = sendLinesToShopifyParent([line]);

      if (sentToShopifyParent) {
        await new Promise((r) => setTimeout(r, 300));
        return;
      }

      const nextCart = addShopifyTestCartLine(line);
      setCartLines(nextCart);
      setCartOpen(true);
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      setIsAddingToCart(false);
    }
  }, [
    cloudOwnerContext,
    currentDesignName,
    getCanvasEl,
    kimonoLogos,
    pantLogos,
    serialize,
    setCameraView,
  ]);

  return (
    <UploadedLogosProvider value={uploadedLogos}>
      <Shell
        onAddToCart={handleAddToCart}
        isAddingToCart={isAddingToCart}
        cartActionLabel={isCartEditMode ? 'Update Cart' : 'Add to Cart'}
        cartActionLoadingLabel={isCartEditMode ? 'Updating…' : 'Adding…'}
      />
      <ShopifyCartDrawer
        open={cartOpen}
        cartLines={cartLines}
        onClose={() => setCartOpen(false)}
        onClear={() => setCartLines([])}
      />
    </UploadedLogosProvider>
  );
});

GiV2ConfiguratorInner.displayName = 'GiV2ConfiguratorInner';

/**
 * All minimal-shell variants share this base (state provider + order flow);
 * only the Shell — the hotspot presentation strategy — differs per version.
 */
export function createGiMinimalConfigurator(
  Shell: ComponentType<GiMinimalShellProps>,
  displayName: string,
  homeView?: CameraView,
) {
  const Configurator = memo(() => (
    <GiStateProvider>
      <GiV2ConfiguratorInner Shell={Shell} homeView={homeView} />
    </GiStateProvider>
  ));
  Configurator.displayName = displayName;
  return Configurator;
}

