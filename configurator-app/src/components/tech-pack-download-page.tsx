import { useEffect, useRef, useState } from 'react';

import { generateGiTechPackPageOne } from './configurators/shared/tech-pack';
import {
  snapshotCanvas,
  snapshotCanvasHighResolution,
} from './configurators/shared/export-pdf';
import { GiCanvas } from './configurators/gi/gi-canvas';
import { GiStateProvider, useGiState } from './configurators/gi/gi-state';
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
  configData?: {
    source?: string;
    spec?: GiSerializedState;
    images?: {
      kimono?: Partial<Record<KimonoLogoSlot, SavedLogoImage>>;
      pant?: Partial<Record<PantLogoSlot, SavedLogoImage>>;
    };
  };
};

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

/**
 * Wait until the gi .glb has loaded + mounted (gi-glb-model fires the event
 * and sets the flag). Resolves immediately if it is already ready, and always
 * resolves after `timeoutMs` so a stuck load can't hang the page forever.
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
 * Runs inside a GiStateProvider so it can hydrate the design and drive the
 * live 3D scene. Captures the six production views ON DEMAND, then builds the
 * PDF — nothing is pre-rendered at add-to-cart.
 */
function TechPackGenerator({ id }: { id: string }) {
  const { hydrate, setCameraView, getCanvasEl } = useGiState();
  const [status, setStatus] = useState('Loading saved design...');
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode's double-invoke so we don't render twice.
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    async function captureView(view: CameraView) {
      setCameraView(view);
      // Let the camera-rig lerp settle + a render frame elapse.
      await delay(700);
      return snapshotCanvasHighResolution() ?? snapshotCanvas(getCanvasEl()) ?? undefined;
    }

    async function run() {
      try {
        const response = await fetch(apiDesignUrl(id), {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(await response.text());

        const payload = (await response.json()) as {
          data?: { design?: SavedDesignRecord };
        };
        const design = payload.data?.design;
        const spec = design?.configData?.spec;
        if (!design || !spec) throw new Error('Saved design record is incomplete.');

        const kimonoLogos = mapLogos(design.configData?.images?.kimono);
        const pantLogos = mapLogos(design.configData?.images?.pant);

        if (cancelled) return;
        setStatus('Rendering production views...');

        // Load the exact configuration into the live 3D scene.
        hydrate(spec, { kimono: kimonoLogos, pant: pantLogos });
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
          orderNumber: orderNumberForDesign(design.id),
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
  }, [id, hydrate, setCameraView, getCanvasEl]);

  return (
    <main className="relative min-h-screen bg-white">
      {/* The live 3D scene must actually render (WebGL) to be captured, so it
          is on-screen but sits behind the status overlay. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <GiCanvas />
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

export function TechPackDownloadPage() {
  const id =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('id')
      : null;

  if (!id) {
    return (
      <main className="grid min-h-screen place-items-center bg-white p-8 text-center">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-[0.18em] uppercase">
            DSPLN Tech Pack
          </h1>
          <p className="mt-5 text-sm text-neutral-600">Missing design id.</p>
        </div>
      </main>
    );
  }

  return (
    <GiStateProvider>
      <TechPackGenerator id={id} />
    </GiStateProvider>
  );
}
