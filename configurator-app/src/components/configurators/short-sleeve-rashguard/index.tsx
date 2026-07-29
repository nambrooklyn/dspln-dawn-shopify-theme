import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { shrinkArtworkDataUrl, uploadPreviewImage } from '../shared/preview-upload';
import {
  buildRashguardCloudDesignUrls,
  getRashguardCloudOwnerContext,
  saveRashguardCloudDesignRecord,
  type RashguardCloudOwnerContext,
} from '../shared/rashguard-cloud-designs';
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
import { createLineDesignId } from '../shared/order-flow';
import { DesignCommandBar } from '../shared/design-command-bar';
import { RashguardShell } from './rashguard-shell';
import { RashguardViewToggle } from './view-toggle';
import { isStudioMode } from '../shared/studio-mode';
import { UploadedArtworkProvider } from './uploaded-artwork-context';
import {
  APPLY_TARGETS,
  uploadedArtworkToFile,
  useUploadedArtwork,
} from './use-uploaded-artwork';
import type { RashguardArtworkTarget } from './rashguard-config';

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
  }).then((dataUrl) =>
    // Oversized uploads used to flow raw into the design-save JSON and blow
    // Netlify's ~6MB function limit ("was not added to cart"). Shrink to the
    // print ceiling first — same shared pipeline the gi family uses.
    dataUrl ? shrinkArtworkDataUrl(dataUrl) : dataUrl,
  );
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
  return RASHGUARD_PRODUCT_CONFIG.designNamePrefix;
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

// DSPLN admin correcting an order's design before it goes to the factory
// (opened from the portal's "Open 3D design"). Saves overwrite the customer's
// original record so the regenerated tech pack is right.
function getAdminEditMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('edit') === 'admin';
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
    addArtworkLayer,
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
  const [cloudOwnerContext] = useState(() =>
    getRashguardCloudOwnerContext(RASHGUARD_PRODUCT_CONFIG),
  );
  const [isAdminEdit] = useState(getAdminEditMode);
  // The owner the design being edited was originally saved under — captured on
  // load in admin mode so a save overwrites that record, not a guest copy.
  const [adminEditOwner, setAdminEditOwner] =
    useState<RashguardCloudOwnerContext | null>(null);
  const [isCartEditMode] = useState(getCartEditMode);
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(
    null,
  );
  const [lastEditedAt, setLastEditedAt] = useState<string | null>(null);
  const draftReadyRef = useRef(false);
  const savingDesignRef = useRef(false);
  const markCleanRef = useRef(false);
  // design id → signature last pushed to the cloud. Share links only work
  // for cloud records, and a plain local save doesn't create one.
  const cloudSyncedRef = useRef(new Map<string, string>());

  // serialize() carries the artwork layers' metadata but not their image
  // content, so the signature appends each layer's imageUrl.
  const designSignature = useMemo(
    () =>
      JSON.stringify({
        spec: serialize(),
        artwork: artworkLayers.map(
          (layer) => `${layer.id}|${layer.imageUrl ?? ''}`,
        ),
      }),
    [artworkLayers, serialize],
  );
  const hasUnsavedChanges = designSignature !== lastSavedSignature;

  const uploadedArtwork = useUploadedArtwork({
    savedDesigns,
    currentArtworkLayers: artworkLayers,
    activeDesignName: currentDesignName,
    defaultDesignName: currentDesignName || formatDesignName(),
  });
  const commandBarUploads = useMemo(
    () => uploadedArtwork.map(({ key, url }) => ({ key, url })),
    [uploadedArtwork],
  );
  const handleApplyUpload = useCallback(
    (uploadKey: string, target: string) => {
      const item = uploadedArtwork.find((entry) => entry.key === uploadKey);
      if (!item) return;
      void uploadedArtworkToFile(item).then((file) => {
        if (!file) return;
        addArtworkLayer({
          file,
          dimensions: { width: item.imageWidth, height: item.imageHeight },
          target: target ? (target as RashguardArtworkTarget) : undefined,
        });
      });
    },
    [addArtworkLayer, uploadedArtwork],
  );

  // Loading a saved design changes state asynchronously; the loader flips
  // this ref so the freshly hydrated content is recorded as "saved" once the
  // new signature lands. Any other signature change is a real edit.
  useEffect(() => {
    if (markCleanRef.current) {
      markCleanRef.current = false;
      setLastSavedSignature(designSignature);
      return;
    }
    if (!draftReadyRef.current) return;
    setLastEditedAt(new Date().toISOString());
  }, [designSignature]);

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
      if (draft.id !== AUTO_RASHGUARD_DRAFT_ID) {
        // A real saved design becomes the active one; its freshly hydrated
        // content is by definition saved.
        setLastEditedAt(draft.updatedAt);
        markCleanRef.current = true;
      }
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

    if (linkedDraft && !getAdminEditMode()) {
      loadDraftDocument(linkedDraft, false);
    } else if (linkedDesignId) {
      // A ?design= link (from an order, the portal, or another browser)
      // points at a CLOUD record this browser has never seen. Fetch and
      // hydrate it — falling back to the local autosave here used to show
      // whatever design the viewer last worked on instead of the order's.
      setCurrentDesignId(linkedDesignId);
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
                id: string;
                name?: string;
                ownerKey?: string;
                shopDomain?: string | null;
                shopifyCustomerId?: string | null;
                customerEmail?: string | null;
                productId?: string | null;
                productHandle?: string;
                createdAt?: string;
                updatedAt?: string;
                configData?: {
                  spec?: RashguardSerializedState;
                  images?: RashguardDraftDocument['images'];
                };
              };
            };
          };
          const design = payload.data?.design;
          const spec = design?.configData?.spec;
          if (!design || !spec) return;
          // Admin edit: keep the record's original owner so a save
          // overwrites the customer's design, not a fresh guest copy.
          if (getAdminEditMode() && design.ownerKey) {
            setAdminEditOwner({
              ownerKey: design.ownerKey,
              shopDomain: design.shopDomain ?? null,
              shopifyCustomerId: design.shopifyCustomerId ?? null,
              customerEmail: design.customerEmail ?? null,
              guestToken: null,
              productId: design.productId ?? null,
              productHandle:
                design.productHandle ??
                RASHGUARD_PRODUCT_CONFIG.shopifyProductHandle,
              isCustomer: Boolean(design.shopifyCustomerId),
            });
          }
          // This design demonstrably lives in the cloud, so a share link
          // works right away; the empty signature makes the first share
          // refresh the record in the background.
          cloudSyncedRef.current.set(design.id, '');
          loadDraftDocument(
            {
              id: design.id,
              name: design.name || 'Ordered design',
              spec,
              images: design.configData?.images ?? [],
              createdAt: design.createdAt ?? new Date().toISOString(),
              updatedAt: design.updatedAt ?? new Date().toISOString(),
            },
            false,
          );
        } catch {
          // Leave the default state; the link id stays attached.
        }
      })();
    } else if (autoDraft) {
      loadDraftDocument(autoDraft, false);
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
    async (name: string, options?: { saveAsNew?: boolean }) => {
      // A save can take a moment (thumbnail snapshot); a second press in
      // that window must not mint a second design record.
      if (savingDesignRef.current) return null;
      savingDesignRef.current = true;
      const signatureAtSave = designSignature;
      setDraftStatus('saving');
      try {
        const cleanName = name.trim() || currentDesignName || formatDesignName();
        const matchingSavedDesign = savedDesigns.find(
          (design) =>
            design.name.trim().toLowerCase() === cleanName.toLowerCase(),
        );
        const id = options?.saveAsNew
          ? createLineDesignId(RASHGUARD_PRODUCT_CONFIG.savedDesignIdPrefix)
          : currentDesignId ??
            matchingSavedDesign?.id ??
            createLineDesignId(RASHGUARD_PRODUCT_CONFIG.savedDesignIdPrefix);
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
        setLastEditedAt(draft.updatedAt);
        setLastSavedSignature(signatureAtSave);
        refreshSavedDesigns();
        setDraftStatus('saved');
        // An admin correction is pointless if it only lives in this browser:
        // the portal regenerates the tech pack from the CLOUD record. Push it
        // there under the design's original owner, and report honestly.
        if (isAdminEdit) {
          const ownerForSave = adminEditOwner ?? cloudOwnerContext;
          const cloudResult = await saveRashguardCloudDesignRecord(
            draft,
            ownerForSave,
            RASHGUARD_PRODUCT_CONFIG,
          ).catch((error: unknown) => {
            console.error('[admin-edit] cloud save failed', error);
            return null;
          });
          if (cloudResult) {
            toast.success('Order design updated — regenerate the tech pack in the portal');
          } else {
            toast.error('Cloud save FAILED — the order design was NOT updated');
          }
        } else {
          toast.success('Design saved locally');
        }
        return draft.id;
      } catch {
        setDraftStatus('error');
        toast.error('Design could not be saved');
        return null;
      } finally {
        savingDesignRef.current = false;
      }
    },
    [
      adminEditOwner,
      artworkLayers,
      cloudOwnerContext,
      currentDesignId,
      currentDesignName,
      designSignature,
      getCanvasEl,
      isAdminEdit,
      refreshSavedDesigns,
      savedDesigns,
      serialize,
    ],
  );

  const handleSaveAsDesign = useCallback(
    (name: string) => handleSaveDesign(name, { saveAsNew: true }),
    [handleSaveDesign],
  );

  // Create/update the cloud record share links point at — the same record
  // shape the add-to-cart flow saves.
  const saveDesignToCloud = useCallback(
    async (designId: string, name: string) => {
      const signatureAtSave = designSignature;
      const existing = readRashguardDraftDocument(designId);
      const draft = await createRashguardDraftDocument({
        id: designId,
        name: name.trim() || formatDesignName(),
        spec: serialize(),
        artworkLayers,
        thumbnailUrl: snapshotCanvas(getCanvasEl()) ?? undefined,
        existingCreatedAt: existing?.createdAt,
      });
      const ownerForSave =
        isAdminEdit && adminEditOwner ? adminEditOwner : cloudOwnerContext;
      const cloudResult = await saveRashguardCloudDesignRecord(
        draft,
        ownerForSave,
        RASHGUARD_PRODUCT_CONFIG,
      );
      if (!cloudResult) return null;
      cloudSyncedRef.current.set(cloudResult.draft.id, signatureAtSave);
      if (cloudResult.draft.id !== designId) {
        setCurrentDesignId(cloudResult.draft.id);
      }
      return cloudResult;
    },
    [adminEditOwner, artworkLayers, cloudOwnerContext, designSignature, getCanvasEl, isAdminEdit, serialize],
  );

  const handleShareDesign = useCallback(
    async (providedDesignId?: string) => {
      const shareName = currentDesignName || formatDesignName();

      // The link only needs the design id, so a design already in the
      // cloud shares instantly; pending edits upload in the background.
      const knownId = providedDesignId ?? currentDesignId;
      if (knownId && cloudSyncedRef.current.has(knownId)) {
        const url = buildRashguardCloudDesignUrls(
          knownId,
          RASHGUARD_PRODUCT_CONFIG,
        )?.designUrl;
        if (url) {
          if (cloudSyncedRef.current.get(knownId) !== designSignature) {
            void saveDesignToCloud(knownId, shareName).catch((err) => {
              console.error(
                '[RashguardConfigurator] background cloud save failed',
                err,
              );
            });
          }
          return url;
        }
      }

      // No cloud record yet — the link would be dead until one exists, so
      // create it first (a local save mints the id when never saved at all).
      const designId = knownId ?? (await handleSaveDesign(shareName));
      if (!designId) {
        toast.error('Save the design before sharing');
        return null;
      }
      try {
        const cloudResult = await saveDesignToCloud(designId, shareName);
        if (!cloudResult) {
          throw new Error('Design record was not saved.');
        }
        const url =
          cloudResult.designUrl ??
          buildRashguardCloudDesignUrls(
            cloudResult.draft.id,
            RASHGUARD_PRODUCT_CONFIG,
          )?.designUrl;
        if (!url) {
          toast.error('Could not build the share link');
          return null;
        }
        return url;
      } catch (err) {
        console.error('[RashguardConfigurator] share cloud save failed', err);
        toast.error('Could not create the share link');
        return null;
      }
    },
    [
      currentDesignId,
      currentDesignName,
      designSignature,
      handleSaveDesign,
      saveDesignToCloud,
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
      if (currentDesignId === id) {
        setCurrentDesignId(null);
        setLastSavedSignature(null);
      }
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
      const captured = captureGarmentViewsSafe();
      const renders = captured
        ? {
            ...captured.views,
            aspect: captured.aspect,
          }
        : undefined;
      let lineDesignId = createLineDesignId(
        RASHGUARD_PRODUCT_CONFIG.orderDesignIdPrefix,
      );
      let designUrl: string | undefined;
      let productionUrl: string | undefined;

      try {
        const draft = await createRashguardDraftDocument({
          id: lineDesignId,
          name: currentDesignName || formatDesignName(),
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
        setCurrentDesignId(cloudResult.draft.id);
        cloudSyncedRef.current.set(cloudResult.draft.id, designSignature);
        const urls = buildRashguardCloudDesignUrls(
          cloudResult.draft.id,
          RASHGUARD_PRODUCT_CONFIG,
        );
        designUrl = cloudResult.designUrl ?? urls?.designUrl;
        productionUrl = cloudResult.productionUrl ?? urls?.productionUrl;
      } catch (err) {
        // Do NOT sell a design we can't reproduce: without a saved record the
        // order's Tech Pack / 3D Design links would be dead (matches gi flow).
        console.error('[RashguardConfigurator] cloud design save failed', err);
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
    currentDesignName,
    designSignature,
    getCanvasEl,
    serialize,
    setCameraView,
    uploadArtworkLayerUrls,
  ]);

  return (
    <UploadedArtworkProvider value={uploadedArtwork}>
      {isAdminEdit ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 60,
            // Informational only — must never swallow clicks on the design
            // actions that sit underneath it.
            pointerEvents: 'none',
            background: '#5d0909',
            color: '#fff',
            textAlign: 'center',
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          DSPLN admin — editing this order&rsquo;s design. Saving updates the
          tech pack the factory receives.
        </div>
      ) : null}
      <RashguardShell
        onAddToCart={handleAddToCart}
        isAddingToCart={isAddingToCart}
        cartActionLabel={isCartEditMode ? 'Update Cart' : 'Add to Cart'}
        cartActionLoadingLabel={isCartEditMode ? 'Updating...' : 'Adding...'}
        skinnyRailContent={
          <RashguardActionRail onLoginToSave={handleLoginToSave} />
        }
        railContent={!isStudioMode() ? undefined :
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
        sceneTopContent={
          <DesignCommandBar
            designId={currentDesignId}
            designName={currentDesignName}
            hasUnsavedChanges={hasUnsavedChanges}
            lastEditedAt={lastEditedAt}
            status={draftStatus}
            onSave={handleSaveDesign}
            onSaveAs={handleSaveAsDesign}
            onShare={handleShareDesign}
            uploads={commandBarUploads}
            uploadTargets={APPLY_TARGETS}
            onApplyUpload={handleApplyUpload}
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
    </UploadedArtworkProvider>
  );
});

RashguardConfiguratorInner.displayName = 'RashguardConfiguratorInner';

export const ShortSleeveRashguardConfigurator = memo(() => (
  <RashguardStateProvider>
    <RashguardConfiguratorInner />
  </RashguardStateProvider>
));

ShortSleeveRashguardConfigurator.displayName =
  'ShortSleeveRashguardConfigurator';
