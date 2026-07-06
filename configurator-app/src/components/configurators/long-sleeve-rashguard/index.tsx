import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ShopifyCartDrawer, sendLinesToShopifyParent } from '../shared/shopify-cart-simulator';
import { RashguardActionRail } from './action-rail';
import {
  addRashguardTestCartLine,
  buildRashguardCartLine,
  clearRashguardTestCart,
  readRashguardTestCart,
} from './rashguard-cart';
import { RashguardCanvas } from './rashguard-canvas';
import {
  snapshotCanvas,
  snapshotCanvasCenteredThumbnail,
  snapshotCanvasThumbnail,
} from './rashguard-export';
import { uploadPreviewImage } from '../shared/preview-upload';
import {
  generateRashguardArtFile,
  type ArtFileOrderInfo,
} from './rashguard-artfile';
import type { GarmentViews } from './rashguard-canvas';
import { RASHGUARD_PRODUCT_CONFIG } from './rashguard-config';
import { RashguardSavedDesignsPanel, type DraftStatus } from './saved-designs-panel';
import {
  AUTO_RASHGUARD_DRAFT_ID,
  createDraftArtworkObjectUrls,
  createRashguardDraftDocument,
  deleteRashguardDraftDocument,
  listSavedRashguardDesigns,
  readRashguardDraftDocument,
  saveRashguardDraftDocument,
  type RashguardDraftDocument,
} from './rashguard-storage';
import {
  RashguardStateProvider,
  useRashguardState,
  type RashguardArtworkLayer,
  type RashguardSerializedState,
} from './rashguard-state';
import { RashguardShell } from './rashguard-shell';
import { RashguardViewToggle } from './view-toggle';

const SHOPIFY_CART_ADDED_MESSAGE = 'dspln:shopify-cart:added';
const SHOPIFY_CART_ERROR_MESSAGE = 'dspln:shopify-cart:error';
const AUTO_SAVE_DELAY_MS = 800;
const CART_PREVIEW_CAMERA_SETTLE_MS = 850;

interface RashguardCartConfigData {
  kind: 'rashguard-cart-config';
  spec: RashguardSerializedState;
  artworkLayerUrls?: Record<number, string>;
}

function isRashguardCartConfigData(value: unknown): value is RashguardCartConfigData {
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
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function imageUrlToDataUrl(url: string) {
  if (url.startsWith('data:image/')) return url;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return fileToDataUrl(new File([blob], 'rashguard-artwork.png', { type: blob.type }));
  } catch {
    return null;
  }
}

function formatDesignName() {
  return `${RASHGUARD_PRODUCT_CONFIG.designNamePrefix} ${new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
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

function formatOrderDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}

// The art-file header is generated once an order is placed. Until a real order
// system supplies the number, the on-demand button uses a preview header with
// today's date and a ship date 7 days out.
function buildPreviewOrderInfo(): ArtFileOrderInfo {
  const now = new Date();
  const ship = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    orderDate: formatOrderDate(now),
    shipDate: formatOrderDate(ship),
    orderNumber: 'PREVIEW',
  };
}

// Render the garment from the 4 tech-pack angles via the canvas-exposed hook.
function captureGarmentViewsSafe(): GarmentViews | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as unknown as Record<string, unknown>)
    .__rashguardCaptureViews as (() => GarmentViews | null) | undefined;
  try {
    return fn?.() ?? null;
  } catch (err) {
    console.error('[ArtFile] view capture failed', err);
    return null;
  }
}

const RashguardConfiguratorInner = memo(() => {
  const {
    setCameraView,
    getCanvasEl,
    serialize,
    hydrate,
    partColors,
    artworkLayers,
    setSelectedPanel,
  } = useRashguardState();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartLines, setCartLines] = useState(() => readRashguardTestCart());
  const [savedDesigns, setSavedDesigns] = useState<RashguardDraftDocument[]>(
    [],
  );
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('loading');
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(() =>
    getLinkedDesignId(),
  );
  const [currentDesignName, setCurrentDesignName] = useState(formatDesignName);
  const [isCartEditMode] = useState(getCartEditMode);
  const draftReadyRef = useRef(false);

  const refreshSavedDesigns = useCallback(() => {
    setSavedDesigns(listSavedRashguardDesigns());
  }, []);

  const loadDraftDocument = useCallback(
    (draft: RashguardDraftDocument, showToast = true) => {
      hydrate(draft.spec, createDraftArtworkObjectUrls(draft));
      setCurrentDesignId(draft.id === AUTO_RASHGUARD_DRAFT_ID ? null : draft.id);
      setCurrentDesignName(
        draft.id === AUTO_RASHGUARD_DRAFT_ID ? formatDesignName() : draft.name,
      );
      if (showToast) toast.success('Saved design loaded');
    },
    [hydrate],
  );

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
        if (typeof data.designId === 'string') setCurrentDesignId(data.designId);
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
    return () =>
      window.removeEventListener('message', handleShopifyCartResult);
  }, [hydrate]);

  useEffect(() => {
    const openArtwork = () => setSelectedPanel('artwork');
    window.addEventListener('dspln:rashguard-rail:artwork', openArtwork);
    return () =>
      window.removeEventListener('dspln:rashguard-rail:artwork', openArtwork);
  }, [setSelectedPanel]);

  useEffect(() => {
    const handleArtFile = async () => {
      const toastId = toast.loading('Generating art file…');
      try {
        const captured = captureGarmentViewsSafe();
        await generateRashguardArtFile({
          partColors,
          artworkLayers,
          orderInfo: buildPreviewOrderInfo(),
          views: captured?.views,
          viewAspect: captured?.aspect,
          onProgress: (i, n, label) =>
            toast.loading(`Rendering ${label} (${i + 1}/${n})…`, { id: toastId }),
        });
        toast.success('Art file downloaded', { id: toastId });
      } catch (err) {
        console.error('[ArtFile] export failed', err);
        toast.error('Art file export failed — try again', { id: toastId });
      }
    };
    window.addEventListener('dspln:rashguard-rail:artfile', handleArtFile);
    // Exposed for automated verification (returns base64 instead of downloading).
    (window as unknown as Record<string, unknown>).__rashguardArtFile = (
      options?: Parameters<typeof generateRashguardArtFile>[0]['options'],
    ) => {
      const captured = captureGarmentViewsSafe();
      return generateRashguardArtFile({
        partColors,
        artworkLayers,
        options,
        orderInfo: buildPreviewOrderInfo(),
        views: captured?.views,
        viewAspect: captured?.aspect,
      });
    };
    return () =>
      window.removeEventListener('dspln:rashguard-rail:artfile', handleArtFile);
  }, [partColors, artworkLayers]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__rashguardHydrate = hydrate;
  }, [hydrate]);

  useEffect(() => {
    const linkedDesignId = getLinkedDesignId();
    const linkedDraft = linkedDesignId
      ? readRashguardDraftDocument(linkedDesignId)
      : null;
    const autoDraft = readRashguardDraftDocument(AUTO_RASHGUARD_DRAFT_ID);
    refreshSavedDesigns();

    if (linkedDraft) {
      loadDraftDocument(linkedDraft, false);
    } else if (autoDraft) {
      loadDraftDocument(autoDraft, false);
    } else if (linkedDesignId) {
      setCurrentDesignId(linkedDesignId);
    }

    draftReadyRef.current = true;
    setDraftStatus('saved');
  }, [loadDraftDocument, refreshSavedDesigns]);

  useEffect(() => {
    if (!draftReadyRef.current) return;
    setDraftStatus('saving');

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
        setDraftStatus('saved');
      } catch {
        setDraftStatus('error');
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [artworkLayers, serialize]);

  const handleSaveDesign = useCallback(
    async (name: string) => {
      setDraftStatus('saving');
      try {
        const cleanName = name.trim() || currentDesignName || formatDesignName();
        const matchingSavedDesign = savedDesigns.find(
          (design) =>
            design.name.trim().toLowerCase() === cleanName.toLowerCase(),
        );
        const id =
          currentDesignId ??
          matchingSavedDesign?.id ??
          `${RASHGUARD_PRODUCT_CONFIG.savedDesignIdPrefix}_${Date.now().toString(36)}`;
        const existing = readRashguardDraftDocument(id);
        const draft = await createRashguardDraftDocument({
          id,
          name: cleanName,
          spec: serialize(),
          artworkLayers,
          thumbnailUrl: snapshotCanvas(getCanvasEl()) ?? undefined,
          existingCreatedAt: existing?.createdAt,
        });
        saveRashguardDraftDocument(draft);
        setCurrentDesignId(draft.id);
        setCurrentDesignName(draft.name);
        refreshSavedDesigns();
        setDraftStatus('saved');
        toast.success('Design saved locally');
      } catch {
        setDraftStatus('error');
        toast.error('Design could not be saved');
      }
    },
    [
      currentDesignId,
      currentDesignName,
      getCanvasEl,
      artworkLayers,
      refreshSavedDesigns,
      savedDesigns,
      serialize,
    ],
  );

  const handleLoadDesign = useCallback(
    (draft: RashguardDraftDocument) => {
      loadDraftDocument(draft);
    },
    [loadDraftDocument],
  );

  const handleDeleteDesign = useCallback(
    (id: string) => {
      deleteRashguardDraftDocument(id);
      refreshSavedDesigns();
      if (currentDesignId === id) setCurrentDesignId(null);
      toast.success('Saved design removed');
    },
    [currentDesignId, refreshSavedDesigns],
  );

  const handleLoginToSave = useCallback(() => {
    toast.message('Account save will be wired after the rashguard is approved locally.');
  }, []);

  const uploadArtworkLayerUrls = useCallback(async () => {
    const artworkLayerUrls: Record<number, string> = {};

    await Promise.all(
      artworkLayers.map(async (layer, index) => {
        if (
          layer.kind !== 'image' ||
          (!layer.file && !layer.imageUrl)
        ) {
          return;
        }

        if (!layer) return;

        const dataUrl = layer.file
          ? await fileToDataUrl(layer.file)
          : layer.imageUrl
            ? await imageUrlToDataUrl(layer.imageUrl)
            : null;
        if (!dataUrl) return;

        const hostedUrl = await uploadPreviewImage(dataUrl);
        const fallbackUrl = layer.imageUrl?.startsWith('http') ? layer.imageUrl : dataUrl;
        const artworkUrl = hostedUrl ?? fallbackUrl;
        if (artworkUrl) artworkLayerUrls[index] = artworkUrl;
      }),
    );

    return artworkLayerUrls;
  }, [artworkLayers]);

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
      const line = buildRashguardCartLine({
        spec,
        thumbnailUrl,
        designId: currentDesignId ?? undefined,
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
  }, [currentDesignId, getCanvasEl, serialize, setCameraView, uploadArtworkLayerUrls]);

  return (
    <>
      <RashguardShell
        onAddToCart={handleAddToCart}
        isAddingToCart={isAddingToCart}
        cartActionLabel={isCartEditMode ? 'Update Cart' : 'Add to Cart'}
        cartActionLoadingLabel={isCartEditMode ? 'Updating...' : 'Adding...'}
        skinnyRailContent={
          <RashguardActionRail onLoginToSave={handleLoginToSave} />
        }
        railContent={
          <RashguardSavedDesignsPanel
            status={draftStatus}
            savedDesigns={savedDesigns}
            defaultDesignName={currentDesignName || formatDesignName()}
            onSaveDesign={handleSaveDesign}
            activeDesignId={currentDesignId}
            activeDesignName={currentDesignName}
            onLoadDesign={handleLoadDesign}
            onDeleteDesign={handleDeleteDesign}
          />
        }
      >
        <RashguardCanvas />
        <RashguardViewToggle />
      </RashguardShell>
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

RashguardConfiguratorInner.displayName = 'RashguardConfiguratorInner';

export const LongSleeveRashguardConfigurator = memo(() => (
  <RashguardStateProvider>
    <RashguardConfiguratorInner />
  </RashguardStateProvider>
));

LongSleeveRashguardConfigurator.displayName =
  'LongSleeveRashguardConfigurator';
