import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { GiStateProvider, useGiState } from './gi-state';
import type { GiSerializedState } from './gi-state';
import { GiCanvas } from './gi-canvas';
import { ConfiguratorActionRail } from './configurator-action-rail';
import { SceneVisibilityControls } from './scene-visibility-controls';
import {
  AUTO_GI_DRAFT_ID,
  createDraftLogoObjectUrls,
  createGiDraftDocument,
  deleteGiDraftDocument,
  listSavedGiDesigns,
  readGiDraftDocument,
  saveGiDraftDocument,
  type GiDraftDocument,
  type GiDraftLogoImage,
} from './gi-draft-storage';
import {
  buildGiCloudDesignUrls,
  deleteGiCloudDesign,
  getGiCloudDesign,
  getGiCloudOwnerContext,
  listGiCloudDesigns,
  saveGiCloudDesign,
  saveGiCloudDesignRecord,
  type CloudArtworkLink,
} from './gi-cloud-designs';
import { SavedDesignsRail, type DraftStatus } from './saved-designs-rail';
import { ConfiguratorShell } from '../shared/configurator-shell';
import {
  exportGiPdf,
  snapshotCanvas,
  snapshotCanvasCenteredThumbnail,
  snapshotCanvasHighResolution,
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
import type { CameraView } from './gi-config';
import { currentGiProductConfig } from '../shared/gi-product-config';

const PRODUCT_CONFIG = currentGiProductConfig();
const PRODUCT_NAME = PRODUCT_CONFIG.productName;
const SHOPIFY_GI_PRODUCT_PATH = PRODUCT_CONFIG.shopifyProductPath;
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

function mergeSavedDesigns(...groups: GiDraftDocument[][]) {
  const designsById = new Map<string, GiDraftDocument>();
  groups.flat().forEach((design) => {
    if (design.id === AUTO_GI_DRAFT_ID) return;
    designsById.set(design.id, design);
  });
  return [...designsById.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

function formatDesignName() {
  return `${PRODUCT_CONFIG.designNamePrefix} ${new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
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

function dataUrlToLogo(image: CartLogoImageData) {
  return {
    imageUrl: image.dataUrl,
    filename: image.filename,
    imageWidth: image.imageWidth,
    imageHeight: image.imageHeight,
  };
}

function cartImagesToLogoImages<TSlot extends string>(
  images: Record<string, CartLogoImageData> | undefined,
) {
  return Object.entries(images ?? {}).reduce<Partial<Record<TSlot, ReturnType<typeof dataUrlToLogo>>>>(
    (acc, [slot, image]) => {
      acc[slot as TSlot] = dataUrlToLogo(image);
      return acc;
    },
    {},
  );
}

function isGiCartConfigData(value: unknown): value is GiCartConfigData {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'gi-cart-config' &&
    (value as { spec?: { kind?: unknown } }).spec?.kind === PRODUCT_CONFIG.stateKind
  );
}

function broadcastCustomerDesignsChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOMER_DESIGNS_CHANGED_KEY, String(Date.now()));
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

function readLocalCartDesignDraft(designId: string | null): GiDraftDocument | null {
  if (typeof window === 'undefined' || !designId) return null;

  try {
    const raw = window.localStorage.getItem(`${PRODUCT_CONFIG.configStoragePrefix}${designId}`);
    if (!raw) return null;
    const spec = JSON.parse(raw) as GiSerializedState;
    if (spec?.kind !== PRODUCT_CONFIG.stateKind) return null;

    const now = new Date().toISOString();
    return {
      id: designId,
      name: formatDesignName(),
      spec,
      createdAt: now,
      updatedAt: now,
      images: {
        kimono: {},
        pant: {},
      },
    };
  } catch {
    return null;
  }
}

const GiConfiguratorInner = memo(() => {
  const {
    layers,
    cameraView,
    setCameraView,
    getCanvasEl,
    serialize,
    hydrate,
    kimonoLogos,
    pantLogos,
    setKimonoLogo,
    setPantLogo,
  } = useGiState();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isCartEditMode] = useState(getCartEditMode);
  const [isExporting, setIsExporting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartLines, setCartLines] = useState<ShopifyCartLine[]>(() =>
    readShopifyTestCart(),
  );
  const [savedDesigns, setSavedDesigns] = useState<GiDraftDocument[]>([]);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('loading');
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(() =>
    getLinkedDesignId(),
  );
  const [currentDesignName, setCurrentDesignName] = useState(formatDesignName);
  const [cloudOwnerContext] = useState(() => getGiCloudOwnerContext());
  const draftReadyRef = useRef(false);

  const refreshSavedDesigns = useCallback(async () => {
    const [localResult, cloudResult] = await Promise.allSettled([
      listSavedGiDesigns(),
      listGiCloudDesigns(cloudOwnerContext),
    ]);
    const localDesigns =
      localResult.status === 'fulfilled' ? localResult.value : [];
    const cloudDesigns =
      cloudResult.status === 'fulfilled' ? cloudResult.value : [];

    setSavedDesigns(
      cloudOwnerContext?.isCustomer
        ? mergeSavedDesigns(cloudDesigns)
        : mergeSavedDesigns(localDesigns, cloudDesigns),
    );
  }, [cloudOwnerContext]);

  const loadDraftDocument = useCallback(
    (draft: GiDraftDocument, showToast = true) => {
      hydrate(draft.spec, createDraftLogoObjectUrls(draft));
      setCurrentDesignId(draft.id === AUTO_GI_DRAFT_ID ? null : draft.id);
      setCurrentDesignName(
        draft.id === AUTO_GI_DRAFT_ID ? formatDesignName() : draft.name,
      );
      if (showToast) {
        toast.success('Saved design loaded');
      }
    },
    [hydrate],
  );

  useEffect(() => {
    const handleShopifyCartResult = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'dspln:cart-design:hydrate') {
        const configData = data.configData as GiSerializedState | GiCartConfigData | undefined;
        const spec = isGiCartConfigData(configData) ? configData.spec : configData;
        if (spec?.kind !== PRODUCT_CONFIG.stateKind) return;

        hydrate(
          spec,
          isGiCartConfigData(configData)
            ? {
                kimono: cartImagesToLogoImages(configData.images.kimono),
                pant: cartImagesToLogoImages(configData.images.pant),
              }
            : undefined,
        );
        if (typeof data.designId === 'string') {
          setCurrentDesignId(data.designId);
        }
        setCurrentDesignName(formatDesignName());
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
    return () =>
      window.removeEventListener('message', handleShopifyCartResult);
  }, [hydrate]);

  useEffect(() => {
    let isActive = true;

    async function loadInitialDraft() {
      setDraftStatus('loading');
      try {
        const linkedDesignId = getLinkedDesignId();
        const [autoDraft] = await Promise.all([
          linkedDesignId
            ? getGiCloudDesign(linkedDesignId).catch(() => null).then(
                (design) =>
                  design ??
                  readLocalCartDesignDraft(linkedDesignId) ??
                  readGiDraftDocument(linkedDesignId) ??
                  readGiDraftDocument(AUTO_GI_DRAFT_ID),
              )
            : readGiDraftDocument(AUTO_GI_DRAFT_ID),
          refreshSavedDesigns(),
        ]);
        if (!isActive) return;
        if (autoDraft) {
          loadDraftDocument(autoDraft, false);
        } else if (linkedDesignId) {
          setCurrentDesignId(linkedDesignId);
        }
        draftReadyRef.current = true;
        setDraftStatus('saved');
      } catch {
        if (!isActive) return;
        draftReadyRef.current = true;
        setDraftStatus('error');
      }
    }

    void loadInitialDraft();

    return () => {
      isActive = false;
    };
  }, [loadDraftDocument, refreshSavedDesigns]);

  useEffect(() => {
    if (!draftReadyRef.current) return;
    setDraftStatus('saving');

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
        setDraftStatus('saved');
      } catch {
        setDraftStatus('error');
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [kimonoLogos, pantLogos, serialize]);

  const handleSaveDesign = useCallback(async (name: string) => {
    setDraftStatus('saving');
    try {
      const cleanName = name.trim() || currentDesignName || formatDesignName();
      const matchingSavedDesign = savedDesigns.find(
        (design) =>
          design.name.trim().toLowerCase() === cleanName.trim().toLowerCase(),
      );
      const id =
        currentDesignId ??
        matchingSavedDesign?.id ??
        createLineDesignId(PRODUCT_CONFIG.savedDesignIdPrefix);
      const existing = await readGiDraftDocument(id);
      const draft = await createGiDraftDocument({
        id,
        name: cleanName,
        spec: serialize(),
        kimonoLogos,
        pantLogos,
        thumbnailUrl: snapshotCanvas(getCanvasEl()) ?? undefined,
        existingCreatedAt: existing?.createdAt,
      });
      await saveGiDraftDocument(draft);

      const cloudDraft = await saveGiCloudDesign(draft, cloudOwnerContext);
      if (cloudDraft) {
        await saveGiDraftDocument(cloudDraft);
        if (cloudDraft.id !== draft.id) {
          await deleteGiDraftDocument(draft.id);
        }
        setCurrentDesignId(cloudDraft.id);
        setCurrentDesignName(cloudDraft.name);
      } else {
        setCurrentDesignId(draft.id);
        setCurrentDesignName(draft.name);
      }

      const savedId = cloudDraft?.id ?? draft.id;

      await refreshSavedDesigns();
      broadcastCustomerDesignsChanged();
      setDraftStatus('saved');
      toast.success(
        cloudDraft
          ? cloudOwnerContext?.isCustomer
            ? 'Design saved to your account'
            : 'Design saved to the cloud'
          : 'Design saved on this browser',
      );
      return savedId;
    } catch {
      setDraftStatus('error');
      toast.error('Design could not be saved');
      return null;
    }
  }, [
    cloudOwnerContext,
    currentDesignId,
    currentDesignName,
    getCanvasEl,
    kimonoLogos,
    pantLogos,
    refreshSavedDesigns,
    savedDesigns,
    serialize,
  ]);

  const handleLoginToSave = useCallback(async () => {
    const savedId = await handleSaveDesign(currentDesignName || formatDesignName());
    const designId = savedId ?? currentDesignId;
    if (!designId || typeof window === 'undefined') {
      window.open('https://dspln.com/account/login', '_top');
      return;
    }

    const returnUrl = new URL(SHOPIFY_GI_PRODUCT_PATH, 'https://dspln.com');
    returnUrl.searchParams.set('design', designId);
    const loginUrl = new URL('/account/login', 'https://dspln.com');
    loginUrl.searchParams.set('return_url', `${returnUrl.pathname}${returnUrl.search}`);
    window.open(loginUrl.toString(), '_top');
  }, [currentDesignId, currentDesignName, handleSaveDesign]);

  const handleLoadDesign = useCallback(
    (draft: GiDraftDocument) => {
      loadDraftDocument(draft);
    },
    [loadDraftDocument],
  );

  const handleDeleteDesign = useCallback(
    async (id: string) => {
      await Promise.allSettled([
        deleteGiDraftDocument(id),
        deleteGiCloudDesign(id, cloudOwnerContext),
      ]);
      await refreshSavedDesigns();
      broadcastCustomerDesignsChanged();
      if (currentDesignId === id) {
        setCurrentDesignId(null);
      }
      toast.success('Saved design removed');
    },
    [cloudOwnerContext, currentDesignId, refreshSavedDesigns],
  );

  const captureView = useCallback(
    async (view: CameraView): Promise<string | null> => {
      setCameraView(view);
      // Let the camera-rig lerp settle + a render frame elapse.
      await new Promise((r) => setTimeout(r, 600));
      return snapshotCanvasHighResolution() ?? snapshotCanvas(getCanvasEl());
    },
    [getCanvasEl, setCameraView],
  );

  const captureTechPackRenders = useCallback(async () => {
    const startView = cameraView;
    const front = await captureView('front');
    const back = await captureView('back');
    const left = await captureView('left');
    const right = await captureView('right');
    const leftBeltEnd = await captureView('left-belt-end');
    const rightBeltEnd = await captureView('right-belt-end');
    setCameraView(startView);
    return {
      front: front ?? undefined,
      back: back ?? undefined,
      left: left ?? undefined,
      right: right ?? undefined,
      leftBeltEnd: leftBeltEnd ?? undefined,
      rightBeltEnd: rightBeltEnd ?? undefined,
    };
  }, [cameraView, captureView, setCameraView]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const startView = cameraView;
      const frontDataUrl = (await captureView('front')) ?? '';
      const backDataUrl = (await captureView('back')) ?? '';
      // Restore the merchant's original view.
      setCameraView(startView);
      exportGiPdf({
        productName: PRODUCT_NAME,
        spec: serialize(),
        layers,
        frontDataUrl,
        backDataUrl,
      });
    } finally {
      setIsExporting(false);
    }
  }, [cameraView, captureView, layers, serialize, setCameraView]);

  const handleAddToCart = useCallback(async () => {
    setIsAddingToCart(true);
    try {
      const spec = serialize();
      const missingSizeMessage = getMissingGiSizeMessage(spec);
      if (missingSizeMessage) {
        toast.error(missingSizeMessage);
        return;
      }
      let localThumbnailUrl = '';

      setCameraView('front');
      await new Promise((r) => setTimeout(r, 700));
      localThumbnailUrl =
        snapshotCanvasCenteredThumbnail(getCanvasEl()) ??
        snapshotCanvasThumbnail(getCanvasEl()) ??
        snapshotCanvas(getCanvasEl()) ??
        '';

      const hostedThumbnailUrl = localThumbnailUrl
        ? await uploadPreviewImage(localThumbnailUrl)
        : null;
      const thumbnailUrl = hostedThumbnailUrl ?? localThumbnailUrl;
      const renders = await captureTechPackRenders();
      let lineDesignId = createLineDesignId(PRODUCT_CONFIG.orderDesignIdPrefix);
      let designUrl: string | undefined;
      let productionUrl: string | undefined;
      let artworkLinks: CloudArtworkLink[] = [];
      let cartConfigData: GiCartConfigData | undefined;

      try {
        const draft = await createGiDraftDocument({
          id: lineDesignId,
          name: currentDesignName || formatDesignName(),
          spec,
          kimonoLogos,
          pantLogos,
          thumbnailUrl,
          renders,
        });
        cartConfigData = await draftToCartConfigData(draft);
        const cloudResult = await saveGiCloudDesignRecord(
          draft,
          cloudOwnerContext,
        );
        if (cloudResult) {
          lineDesignId = cloudResult.draft.id;
          setCurrentDesignId(cloudResult.draft.id);
          broadcastCustomerDesignsChanged();
          const urls = buildGiCloudDesignUrls(cloudResult.draft.id);
          designUrl = cloudResult.designUrl ?? urls?.designUrl;
          productionUrl = cloudResult.productionUrl ?? urls?.productionUrl;
          artworkLinks = cloudResult.artwork;
        }
      } catch {
        // Cart add should still work if cloud save is temporarily unavailable.
      }

      const line = buildShopifyTestCartLine({
        spec,
        thumbnailUrl,
        designId: lineDesignId,
        designUrl,
        productionUrl,
        artworkLinks,
        configData: cartConfigData,
      });
      const sentToShopifyParent = sendLinesToShopifyParent([line]);

      if (sentToShopifyParent) {
        // In Shopify iframe mode the parent page owns the real cart drawer.
        // Keep the local simulator out of the way.
        await new Promise((r) => setTimeout(r, 300));
        return;
      }

      const nextCart = addShopifyTestCartLine(line);
      setCartLines(nextCart);
      setCartOpen(true);
      // eslint-disable-next-line no-console
      console.log('[GiConfigurator] Shopify cart line:', line);
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      setIsAddingToCart(false);
    }
  }, [
    cloudOwnerContext,
    captureTechPackRenders,
    currentDesignId,
    currentDesignName,
    getCanvasEl,
    kimonoLogos,
    pantLogos,
    serialize,
    setCameraView,
  ]);

  return (
    <>
      <ConfiguratorShell
        onAddToCart={handleAddToCart}
        onExport={handleExport}
        isAddingToCart={isAddingToCart}
        isExporting={isExporting}
        cartActionLabel={isCartEditMode ? 'Update Cart' : 'Add to Cart'}
        cartActionLoadingLabel={isCartEditMode ? 'Updating...' : 'Adding...'}
        skinnyRailContent={
          <ConfiguratorActionRail
            isCustomer={cloudOwnerContext?.isCustomer}
            onLoginToSave={handleLoginToSave}
          />
        }
        sceneTopContent={
          cloudOwnerContext?.isCustomer ? (
            <div
              className="flex max-w-[32rem] items-center gap-4 text-[9px] font-semibold tracking-[0.14em] uppercase"
              title={cloudOwnerContext.customerEmail ?? undefined}
            >
              <span className="text-muted-foreground truncate">
                {cloudOwnerContext.customerEmail}
              </span>
              <a
                href="https://dspln.com/account/logout"
                target="_top"
                className="text-foreground hover:text-muted-foreground shrink-0"
              >
                Sign Out
              </a>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLoginToSave}
              className="text-foreground hover:text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase"
            >
              Log In To Save
            </button>
          )
        }
        railContent={
          <SavedDesignsRail
            status={draftStatus}
            savedDesigns={savedDesigns}
            defaultDesignName={currentDesignName || formatDesignName()}
            storageLabel={
              cloudOwnerContext?.isCustomer
                ? 'Saved to your account'
                : 'Cloud saved for this browser'
            }
            onSaveDesign={handleSaveDesign}
            activeDesignId={currentDesignId}
            activeDesignName={currentDesignName}
            onLoadDesign={handleLoadDesign}
            onDeleteDesign={handleDeleteDesign}
            onApplyKimonoLogo={setKimonoLogo}
            onApplyPantLogo={setPantLogo}
            currentKimonoLogos={kimonoLogos}
            currentPantLogos={pantLogos}
          />
        }
      >
        <GiCanvas />
        <SceneVisibilityControls />
      </ConfiguratorShell>
      <ShopifyCartDrawer
        open={cartOpen}
        cartLines={cartLines}
        onClose={() => setCartOpen(false)}
        onClear={() => {
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(PRODUCT_CONFIG.testCartStorageKey);
          }
          setCartLines([]);
        }}
      />
    </>
  );
});
GiConfiguratorInner.displayName = 'GiConfiguratorInner';

/**
 * The gi configurator — a self-contained, drop-in component.
 * Mounts its own state provider so it can be rendered anywhere without
 * external state plumbing.
 */
export const GiConfigurator = memo(() => (
  <GiStateProvider>
    <GiConfiguratorInner />
  </GiStateProvider>
));

GiConfigurator.displayName = 'GiConfigurator';
