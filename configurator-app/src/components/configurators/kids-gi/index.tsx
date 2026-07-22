import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ConfiguratorShell } from './configurator-shell';
import {
  exportGiPdf,
  snapshotCanvas,
  snapshotCanvasCenteredThumbnail,
  snapshotCanvasHighResolution,
  snapshotCanvasThumbnail,
} from '../shared/export-pdf';
import { uploadPreviewImage } from '../shared/preview-upload';
import { createLineDesignId, getMissingGiSizeMessage } from '../shared/order-flow';
import {
  addShopifyTestCartLine,
  buildShopifyTestCartLine,
  readShopifyTestCart,
  sendLinesToShopifyParent,
  ShopifyCartDrawer,
  type ShopifyCartLine,
} from './shopify-cart-simulator';
import type { CameraView } from './gi-config';
import { GI_CAMERA_TWEEN_MS } from './gi-config';
import { CameraTuner } from './camera-tuner';
import { GI_PRODUCT_CONFIGS } from '../shared/gi-product-config';
import { storefrontOrigin, storefrontUrl } from '../shared/storefront-links';
import {
  logoSetSignature,
  readActiveDesignLink,
  writeActiveDesignLink,
} from '../shared/active-design-link';
import { isStudioMode } from '../shared/studio-mode';

const PRODUCT_CONFIG = GI_PRODUCT_CONFIGS.kids;
const PRODUCT_NAME = PRODUCT_CONFIG.productName;
const ACTIVE_DESIGN_LINK_KEY = `${PRODUCT_CONFIG.configStoragePrefix}active-design-link:v1`;
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
  images: GiDraftDocument['images']['kimono'] | GiDraftDocument['images']['pant'],
) {
  const entries = await Promise.all(
    Object.entries(images).map(async ([slot, image]) => {
      if (!image) return null;
      const dataUrl = await blobToDataUrl(image.blob);
      if (!dataUrl) return null;
      return [
        slot,
        {
          dataUrl,
          filename: image.filename,
          imageWidth: image.imageWidth,
          imageHeight: image.imageHeight,
        },
      ] as const;
    }),
  );

  return entries.reduce<Record<string, CartLogoImageData>>((acc, entry) => {
    if (!entry) return acc;
    const [slot, image] = entry;
    acc[slot as TSlot] = image;
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
  const [isExporting, setIsExporting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartLines, setCartLines] = useState<ShopifyCartLine[]>(() =>
    readShopifyTestCart(),
  );
  const [isCartEditMode] = useState(getCartEditMode);
  const [savedDesigns, setSavedDesigns] = useState<GiDraftDocument[]>([]);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('loading');
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(
    () =>
      getLinkedDesignId() ?? readActiveDesignLink(ACTIVE_DESIGN_LINK_KEY)?.id ?? null,
  );
  const [currentDesignName, setCurrentDesignName] = useState(() =>
    getLinkedDesignId()
      ? formatDesignName()
      : readActiveDesignLink(ACTIVE_DESIGN_LINK_KEY)?.name || formatDesignName(),
  );
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(
    () =>
      getLinkedDesignId()
        ? null
        : (readActiveDesignLink(ACTIVE_DESIGN_LINK_KEY)?.signature ?? null),
  );
  const [isSavingDesign, setIsSavingDesign] = useState(false);
  const [cloudOwnerContext] = useState(() => getGiCloudOwnerContext());
  const draftReadyRef = useRef(false);
  const savingDesignRef = useRef(false);
  const markCleanRef = useRef(false);

  const designSignature = useMemo(
    () =>
      JSON.stringify({
        spec: serialize(),
        kimono: logoSetSignature(kimonoLogos),
        pant: logoSetSignature(pantLogos),
      }),
    [kimonoLogos, pantLogos, serialize],
  );
  const hasUnsavedChanges = designSignature !== lastSavedSignature;

  // Loading a saved design changes state asynchronously; the loader flips
  // this ref so the freshly hydrated content is recorded as "saved" once the
  // new signature lands.
  useEffect(() => {
    if (!markCleanRef.current) return;
    markCleanRef.current = false;
    setLastSavedSignature(designSignature);
    if (currentDesignId) {
      writeActiveDesignLink(ACTIVE_DESIGN_LINK_KEY, {
        id: currentDesignId,
        name: currentDesignName,
        signature: designSignature,
      });
    }
  }, [currentDesignId, currentDesignName, designSignature]);

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
      if (draft.id !== AUTO_GI_DRAFT_ID) {
        // A real saved design becomes the active one; its freshly hydrated
        // content is by definition saved.
        setCurrentDesignId(draft.id);
        setCurrentDesignName(draft.name);
        markCleanRef.current = true;
      }
      // The autosave draft keeps whatever active-design link was restored
      // from the previous session, so "Save" keeps updating that design
      // across reloads instead of minting a duplicate.
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
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadInitialDraft() {
      setDraftStatus('loading');
      try {
        const linkedDesignId = getLinkedDesignId();
        const [autoDraft] = await Promise.all([
          linkedDesignId
            ? getGiCloudDesign(linkedDesignId).then((design) => design ?? readGiDraftDocument(AUTO_GI_DRAFT_ID))
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
          name: 'Autosaved Kids Gi Draft',
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
    // A save can take a few seconds (thumbnail + uploads); a second press in
    // that window must not mint a second design record.
    if (savingDesignRef.current) return null;
    savingDesignRef.current = true;
    setIsSavingDesign(true);
    const signatureAtSave = designSignature;
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
      const savedName = cloudDraft?.name ?? draft.name;

      setLastSavedSignature(signatureAtSave);
      writeActiveDesignLink(ACTIVE_DESIGN_LINK_KEY, {
        id: savedId,
        name: savedName,
        signature: signatureAtSave,
      });

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
    } finally {
      savingDesignRef.current = false;
      setIsSavingDesign(false);
    }
  }, [
    cloudOwnerContext,
    currentDesignId,
    currentDesignName,
    designSignature,
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
      window.open(storefrontUrl('/account/login'), '_top');
      return;
    }

    const returnUrl = new URL(SHOPIFY_GI_PRODUCT_PATH, storefrontOrigin());
    returnUrl.searchParams.set('design', designId);
    const loginUrl = new URL('/account/login', storefrontOrigin());
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
        setLastSavedSignature(null);
        writeActiveDesignLink(ACTIVE_DESIGN_LINK_KEY, null);
      }
      toast.success('Saved design removed');
    },
    [cloudOwnerContext, currentDesignId, refreshSavedDesigns],
  );

  const captureView = useCallback(
    async (view: CameraView): Promise<string | null> => {
      setCameraView(view);
      // Let the camera tween settle + a render frame elapse.
      await new Promise((r) => setTimeout(r, GI_CAMERA_TWEEN_MS + 200));
      return snapshotCanvasHighResolution() ?? snapshotCanvas(getCanvasEl());
    },
    [getCanvasEl, setCameraView],
  );


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
      let lineDesignId = createLineDesignId(PRODUCT_CONFIG.orderDesignIdPrefix);
      let fallbackUrls = buildGiCloudDesignUrls(lineDesignId);
      let designUrl: string | undefined = fallbackUrls?.designUrl;
      let productionUrl: string | undefined = fallbackUrls?.productionUrl;
      let artworkLinks: CloudArtworkLink[] = [];
      let cartConfigData: GiCartConfigData | undefined;
      let cartDraft: GiDraftDocument | null = null;

      try {
        cartDraft = await createGiDraftDocument({
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
        cartDraft = cloudResult.draft;
        setCurrentDesignId(cloudResult.draft.id);
        broadcastCustomerDesignsChanged();
        fallbackUrls = buildGiCloudDesignUrls(cloudResult.draft.id);
        designUrl = cloudResult.designUrl ?? fallbackUrls?.designUrl;
        productionUrl = cloudResult.productionUrl ?? fallbackUrls?.productionUrl;
        artworkLinks = cloudResult.artwork;
      } catch (err) {
        console.error('[KidsGiConfigurator] Cloud design save failed', err);
        toast.error('Could not save the production design', {
          description:
            'The gi was not added to cart because the Tech Pack and 3D Design links would not work.',
        });
        return;
      }

      // Tech-pack views are no longer captured at add-to-cart — the tech pack
      // renders on demand from the admin order page (/tech-pack/gi).

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
      console.log('[KidsGiConfigurator] Shopify cart line:', line);
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      setIsAddingToCart(false);
    }
  }, [
    cloudOwnerContext,
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
                href={storefrontUrl('/account/logout')}
                target="_top"
                className="text-foreground hover:text-muted-foreground shrink-0"
              >
                Sign Out
              </a>
            </div>
          ) : null
          // Login entry points are hidden until the account flow ships:
          // the theme doesn't pass customer identity yet, so the login
          // round-trip appears broken to customers.
        }
        railContent={!isStudioMode() && !cloudOwnerContext?.isCustomer ? undefined :
          <>
          {isStudioMode() ? <CameraTuner /> : null}
          <SavedDesignsRail
            status={draftStatus}
            savedDesigns={savedDesigns}
            defaultDesignName={currentDesignName || formatDesignName()}
            storageLabel={
              cloudOwnerContext?.isCustomer
                ? 'Saved to your account'
                : 'Saved for this browser only'
            }
            isSaving={isSavingDesign}
            hasUnsavedChanges={hasUnsavedChanges}
            isCustomer={cloudOwnerContext?.isCustomer}
            onLoginToSave={handleLoginToSave}
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
          </>
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
export const KidsGiConfigurator = memo(() => (
  <GiStateProvider>
    <GiConfiguratorInner />
  </GiStateProvider>
));

KidsGiConfigurator.displayName = 'KidsGiConfigurator';
