import { useEffect, useRef, useState, type ReactNode } from 'react';

import { generateGiTechPackPageOne } from './configurators/shared/tech-pack';
import {
  snapshotCanvas,
  snapshotCanvasHighResolution,
} from './configurators/shared/export-pdf';
import { GiCanvas as MensCanvas } from './configurators/gi/gi-canvas';
import {
  GiStateProvider as MensProvider,
  useGiState as useMensState,
} from './configurators/gi/gi-state';
import { GiCanvas as WomensCanvas } from './configurators/womens-gi/gi-canvas';
import {
  GiStateProvider as WomensProvider,
  useGiState as useWomensState,
} from './configurators/womens-gi/gi-state';
import { GiCanvas as KidsCanvas } from './configurators/kids-gi/gi-canvas';
import {
  GiStateProvider as KidsProvider,
  useGiState as useKidsState,
} from './configurators/kids-gi/gi-state';
import type { GiSerializedState, KimonoLogo } from './configurators/gi/gi-state';
import type {
  CameraView,
  KimonoLogoSlot,
  PantLogoSlot,
} from './configurators/gi/gi-config';

type SavedLogoImage = {
  dataUrl?: string;
  shopifyUrl?: string;
  filename?: string;
  imageWidth?: number;
  imageHeight?: number;
};

type SavedDesignRecord = {
  id: string;
  name?: string;
  thumbnailUrl?: string | null;
  // Stamped onto the record by the Shopify order webhook once the order is
  // placed (e.g. orderName "#1042"). Absent for pre-webhook / unpurchased
  // designs, in which case we fall back to the design id.
  orderName?: string;
  orderNumber?: number | string;
  configData?: {
    source?: string;
    spec?: GiSerializedState;
    images?: {
      kimono?: Partial<Record<KimonoLogoSlot, SavedLogoImage>>;
      pant?: Partial<Record<PantLogoSlot, SavedLogoImage>>;
    };
  };
};

type TechPackLogos = {
  kimono?: Partial<Record<KimonoLogoSlot, KimonoLogo>>;
  pant?: Partial<Record<PantLogoSlot, KimonoLogo>>;
};

// The three garment gi-state modules are structurally identical clones, so we
// drive them through one shared interface. Women's / kids state is cast to
// this in their wrappers.
interface TechPackDriver {
  hydrate: (spec: GiSerializedState, logos: TechPackLogos) => void;
  setCameraView: (view: CameraView) => void;
  getCanvasEl: () => HTMLCanvasElement | null;
}

function apiDesignUrl(id: string) {
  const url = new URL('/api/customer-designs', window.location.origin);
  url.searchParams.set('id', id);
  return url;
}

function savedImageToLogo(image?: SavedLogoImage): KimonoLogo | undefined {
  const imageUrl = image?.shopifyUrl || image?.dataUrl;
  if (!imageUrl) return undefined;
  return {
    imageUrl,
    filename: image.filename || 'artwork.png',
    imageWidth: image.imageWidth || 120,
    imageHeight: image.imageHeight || 120,
  };
}

function mapLogos<TSlot extends string>(
  images?: Partial<Record<TSlot, SavedLogoImage>>,
) {
  return Object.entries(images ?? {}).reduce<Partial<Record<TSlot, KimonoLogo>>>(
    (acc, [slot, image]) => {
      const logo = savedImageToLogo(image as SavedLogoImage | undefined);
      if (logo) acc[slot as TSlot] = logo;
      return acc;
    },
    {},
  );
}

function orderNumberForDesign(id: string) {
  return id.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
}

// The order number shown in the header: the real Shopify order name once the
// webhook has stamped it, otherwise the design id as a fallback.
function orderNumberForRecord(design: SavedDesignRecord) {
  return (
    design.orderName ||
    (design.orderNumber != null ? String(design.orderNumber) : '') ||
    orderNumberForDesign(design.id)
  );
}

// Product name used in the download filename, by garment family.
function productNameForSource(source?: string) {
  if (source === 'dspln-womens-gi-configurator') return 'womens-gi';
  if (source === 'dspln-kids-gi-configurator') return 'kids-gi';
  return 'mens-gi';
}

/**
 * Wait until the active garment .glb has loaded + mounted (gi-glb-model fires
 * the event and sets the flag). Resolves immediately if already ready, and
 * always resolves after `timeoutMs` so a stuck load can't hang the page.
 */
function waitForModelReady(timeoutMs = 20000) {
  return new Promise<void>((resolve) => {
    const w = window as unknown as { __giModelReady?: boolean };
    if (w.__giModelReady) {
      resolve();
      return;
    }
    let timer = 0;
    const done = () => {
      window.removeEventListener('dspln:gi-model-ready', done);
      window.clearTimeout(timer);
      resolve();
    };
    window.addEventListener('dspln:gi-model-ready', done);
    timer = window.setTimeout(done, timeoutMs);
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Warm the browser cache for a remote logo image before the 3D scene mounts
 * its decals. ProjectedDecal loads textures async (TextureLoader, anonymous
 * CORS) and the capture sequence doesn't wait for them — in a live session
 * logos are instant blob: URLs, but here they're remote CDN URLs, so without
 * preloading the views capture BEFORE the decals appear and the renders come
 * out bare. Same crossOrigin mode so the cache entry is shared. Always
 * resolves (timeout/error) so a bad image can't hang the pipeline.
 */
function preloadImage(url: string, timeoutMs = 10000) {
  return new Promise<void>((resolve) => {
    if (!url || url.startsWith('data:')) {
      resolve();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(), timeoutMs);
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    img.onload = done;
    img.onerror = done;
    img.src = url;
  });
}

/**
 * Drives the live 3D scene for whichever garment mounted us: hydrate the saved
 * design, capture the six production views ON DEMAND, then build the PDF.
 * Nothing is pre-rendered at add-to-cart.
 */
function useTechPackRun(design: SavedDesignRecord, driver: TechPackDriver) {
  const [status, setStatus] = useState('Rendering production views...');
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  // Hold the driver in a ref so the run effect does NOT depend on the state
  // object's identity. hydrate() triggers state updates that change `driver`'s
  // identity mid-capture; if the effect depended on it, React would fire the
  // cleanup (cancelling the in-flight run) and the PDF would never generate.
  const driverRef = useRef(driver);
  driverRef.current = driver;

  useEffect(() => {
    // Guard against React StrictMode's double-invoke so we don't render twice.
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    async function captureView(view: CameraView) {
      driverRef.current.setCameraView(view);
      // Let the camera-rig lerp settle + a render frame elapse.
      await delay(700);
      return (
        snapshotCanvasHighResolution() ??
        snapshotCanvas(driverRef.current.getCanvasEl()) ??
        undefined
      );
    }

    async function run() {
      try {
        const spec = design.configData?.spec;
        if (!spec) throw new Error('Saved design record is incomplete.');

        const kimonoLogos = mapLogos(design.configData?.images?.kimono);
        const pantLogos = mapLogos(design.configData?.images?.pant);

        // Warm the cache for every remote logo image FIRST so the decal
        // textures apply instantly when the scene hydrates (see preloadImage).
        await Promise.all(
          [...Object.values(kimonoLogos), ...Object.values(pantLogos)]
            .filter((logo): logo is KimonoLogo => Boolean(logo?.imageUrl))
            .map((logo) => preloadImage(logo.imageUrl)),
        );

        // Load the exact configuration into the live 3D scene.
        driverRef.current.hydrate(spec, { kimono: kimonoLogos, pant: pantLogos });
        await waitForModelReady();
        // Give colors / logo decals a couple frames to composite.
        await delay(700);

        const front = await captureView('front');
        const back = await captureView('back');
        const left = await captureView('left');
        const right = await captureView('right');
        const leftBeltEnd = spec.belt?.embroidery?.leftEnd?.trim()
          ? await captureView('left-belt-end')
          : undefined;
        const rightBeltEnd = spec.belt?.embroidery?.rightEnd?.trim()
          ? await captureView('right-belt-end')
          : undefined;

        if (cancelled) return;
        setStatus('Generating production PDF...');

        await generateGiTechPackPageOne({
          spec,
          frontDataUrl: front ?? design.thumbnailUrl ?? '',
          backDataUrl: back ?? front ?? '',
          leftSideDataUrl: left,
          rightSideDataUrl: right,
          leftBeltEndDataUrl: leftBeltEnd,
          rightBeltEndDataUrl: rightBeltEnd,
          kimonoLogos,
          pantLogos,
          orderNumber: orderNumberForRecord(design),
          productName: productNameForSource(design.configData?.source),
          includeSizeMeasurements:
            design.configData?.source !== 'dspln-kids-gi-configurator',
        });

        if (!cancelled) {
          setStatus('Tech pack PDF generated. Check your downloads.');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to generate tech pack.');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // Intentionally depends only on `design` (stable once loaded). `driver` is
    // read through driverRef so its changing identity can't cancel the run.
  }, [design]);

  return { status, error };
}

function TechPackFrame({
  status,
  error,
  children,
}: {
  status: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-screen bg-white">
      {/* The live 3D scene must actually render (WebGL) to be captured, so it
          is on-screen but sits behind the status overlay. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center bg-white/95 p-8 text-center">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-[0.18em] uppercase">
            DSPLN Tech Pack
          </h1>
          <p className="mt-5 text-sm text-neutral-600">{error ?? status}</p>
        </div>
      </div>
    </main>
  );
}

function MensTechPack({ design }: { design: SavedDesignRecord }) {
  const driver = useMensState() as unknown as TechPackDriver;
  const { status, error } = useTechPackRun(design, driver);
  return (
    <TechPackFrame status={status} error={error}>
      <MensCanvas />
    </TechPackFrame>
  );
}

function WomensTechPack({ design }: { design: SavedDesignRecord }) {
  const driver = useWomensState() as unknown as TechPackDriver;
  const { status, error } = useTechPackRun(design, driver);
  return (
    <TechPackFrame status={status} error={error}>
      <WomensCanvas />
    </TechPackFrame>
  );
}

function KidsTechPack({ design }: { design: SavedDesignRecord }) {
  const driver = useKidsState() as unknown as TechPackDriver;
  const { status, error } = useTechPackRun(design, driver);
  return (
    <TechPackFrame status={status} error={error}>
      <KidsCanvas />
    </TechPackFrame>
  );
}

function StatusScreen({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-white p-8 text-center">
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-[0.18em] uppercase">
          DSPLN Tech Pack
        </h1>
        <p className="mt-5 text-sm text-neutral-600">{message}</p>
      </div>
    </main>
  );
}

export function TechPackDownloadPage() {
  const id =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('id')
      : null;
  const [design, setDesign] = useState<SavedDesignRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      // The order webhook stamps the order number onto the record a few
      // seconds after checkout (storage is eventually consistent). If we load
      // a record that has no order number yet, retry a few times so a freshly
      // placed order shows its real number instead of the design-id fallback.
      // This ONLY delays that first fetch — it can't affect rendering. Old /
      // unpurchased designs simply never get a number and fall through.
      const MAX_ATTEMPTS = 4;
      const RETRY_MS = 2000;
      try {
        let record: SavedDesignRecord | undefined;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
          const response = await fetch(apiDesignUrl(id), {
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error(await response.text());
          const payload = (await response.json()) as {
            data?: { design?: SavedDesignRecord };
          };
          record = payload.data?.design;
          if (!record?.configData?.spec) {
            throw new Error('Saved design record is incomplete.');
          }
          // Got the order number, or out of attempts → stop waiting.
          if (record.orderName || attempt === MAX_ATTEMPTS - 1) break;
          await new Promise((r) => setTimeout(r, RETRY_MS));
          if (cancelled) return;
        }
        if (!cancelled && record) setDesign(record);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load design.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return <StatusScreen message="Missing design id." />;
  if (error) return <StatusScreen message={error} />;
  if (!design) return <StatusScreen message="Loading saved design..." />;

  // Mount the 3D stack for the garment this design belongs to, so the tech
  // pack renders the correct model — men's, women's, or kids'.
  const source = design.configData?.source;
  if (source === 'dspln-womens-gi-configurator') {
    return (
      <WomensProvider>
        <WomensTechPack design={design} />
      </WomensProvider>
    );
  }
  if (source === 'dspln-kids-gi-configurator') {
    return (
      <KidsProvider>
        <KidsTechPack design={design} />
      </KidsProvider>
    );
  }
  return (
    <MensProvider>
      <MensTechPack design={design} />
    </MensProvider>
  );
}
