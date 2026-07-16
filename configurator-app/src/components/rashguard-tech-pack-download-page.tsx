import { useEffect, useState } from 'react';

import {
  generateRashguardArtFile as generateShortSleeveRashguardArtFile,
  type ArtFileOrderInfo,
  type ArtFileViews,
} from './configurators/short-sleeve-rashguard/rashguard-artfile';
import { generateRashguardArtFile as generateLongSleeveRashguardArtFile } from './configurators/long-sleeve-rashguard/rashguard-artfile';
import { generateRashguardArtFile as generateAdultGrapplingShortArtFile } from './configurators/adult-grappling-short/rashguard-artfile';
import { storeTechPackPdf } from './configurators/shared/tech-pack-store';
import type {
  RashguardArtworkLayer,
  RashguardSerializedState,
} from './configurators/short-sleeve-rashguard/rashguard-state';

type RashguardSource =
  | 'short-sleeve-rashguard'
  | 'long-sleeve-rashguard'
  | 'adult-grappling-short';

type SavedArtworkImage = {
  id: string;
  kind?: 'image' | 'text';
  dataUrl?: string;
  filename?: string;
  imageWidth?: number;
  imageHeight?: number;
  text?: string;
  fontFamily?: string;
  color?: string;
  outlineColor?: string;
  outlineWidth?: number;
  target?: string;
  x?: number;
  y?: number;
  scale?: number;
  rotationDeg?: number;
  visible?: boolean;
  locked?: boolean;
};

type SavedDesignRecord = {
  id: string;
  name?: string;
  thumbnailUrl?: string | null;
  // Stamped by the Shopify order webhook once the order is placed.
  orderName?: string;
  orderNumber?: number | string;
  configData?: {
    source?: string;
    spec?: RashguardSerializedState;
    images?: SavedArtworkImage[];
    renders?: Partial<ArtFileViews> & { aspect?: number };
  };
};

function apiDesignUrl(id: string) {
  const url = new URL('/api/customer-designs', window.location.origin);
  url.searchParams.set('id', id);
  return url;
}

function formatDate(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getMonth() + 1)}/${p(date.getDate())}/${date.getFullYear()}`;
}

function parseDate(value: string | null) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function orderNumberForDesign(id: string) {
  return id.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
}

// Real Shopify order number once the webhook has stamped it, else the design
// id fallback (a manual ?order= override still wins for one-off reprints).
function orderNumberForRecord(design: SavedDesignRecord) {
  const params = new URLSearchParams(window.location.search);
  return (
    design.orderName ||
    (design.orderNumber != null ? String(design.orderNumber) : '') ||
    params.get('order')?.trim() ||
    orderNumberForDesign(design.id)
  );
}

/** Filesystem-safe slug for the download filename. */
function fileNameSlug(value: string, fallback: string) {
  const slug = value
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return slug || fallback;
}

function buildOrderInfo(design: SavedDesignRecord): ArtFileOrderInfo {
  const params = new URLSearchParams(window.location.search);
  const orderDate = parseDate(params.get('date'));
  const shipDate = new Date(orderDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    orderDate: formatDate(orderDate),
    shipDate: formatDate(shipDate),
    orderNumber: orderNumberForRecord(design),
  };
}

function isRashguardSource(source: string | undefined): source is RashguardSource {
  return (
    source === 'short-sleeve-rashguard' ||
    source === 'long-sleeve-rashguard' ||
    source === 'adult-grappling-short'
  );
}

function imageUrlForLayer(
  layer: RashguardSerializedState['artworkLayers'][number],
  images: SavedArtworkImage[] | undefined,
) {
  return images?.find((image) => image.id === layer.id)?.dataUrl;
}

function buildArtworkLayers(
  spec: RashguardSerializedState,
  images: SavedArtworkImage[] | undefined,
) {
  return spec.artworkLayers.map((layer) => {
    const image = images?.find((item) => item.id === layer.id);
    return {
      ...layer,
      kind: layer.kind === 'text' ? 'text' : 'image',
      imageUrl: layer.kind === 'text' ? undefined : imageUrlForLayer(layer, images),
      filename: image?.filename ?? layer.filename,
      imageWidth: image?.imageWidth ?? layer.imageWidth,
      imageHeight: image?.imageHeight ?? layer.imageHeight,
      text: image?.text ?? layer.text,
      fontFamily: image?.fontFamily ?? layer.fontFamily,
      color: image?.color ?? layer.color,
      outlineColor: image?.outlineColor ?? layer.outlineColor,
      outlineWidth: image?.outlineWidth ?? layer.outlineWidth,
      target: (image?.target ?? layer.target) as RashguardArtworkLayer['target'],
      x: image?.x ?? layer.x,
      y: image?.y ?? layer.y,
      scale: image?.scale ?? layer.scale,
      rotationDeg: image?.rotationDeg ?? layer.rotationDeg,
      visible: image?.visible ?? layer.visible,
      locked: image?.locked ?? layer.locked ?? false,
      placementPending: false,
    } satisfies RashguardArtworkLayer;
  });
}

function completeViews(
  renders: (Partial<ArtFileViews> & { aspect?: number }) | undefined,
) {
  if (!renders?.front || !renders.back || !renders.left || !renders.right) {
    return undefined;
  }
  return {
    front: renders.front,
    back: renders.back,
    left: renders.left,
    right: renders.right,
  } satisfies ArtFileViews;
}

export function RashguardTechPackDownloadPage() {
  const [status, setStatus] = useState('Preparing DSPLN tech pack...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const id = new URLSearchParams(window.location.search).get('id');
      if (!id) {
        setError('Missing design id.');
        return;
      }

      try {
        // Retry a few times so a freshly placed order picks up its stamped
        // order number (storage is eventually consistent — see the gi page).
        const MAX_ATTEMPTS = 4;
        const RETRY_MS = 2000;
        let design: SavedDesignRecord | undefined;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
          const response = await fetch(apiDesignUrl(id), {
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error(await response.text());
          const payload = (await response.json()) as {
            data?: { design?: SavedDesignRecord };
          };
          design = payload.data?.design;
          if (!design?.configData?.spec) {
            throw new Error('Saved design record is incomplete.');
          }
          if (design.orderName || attempt === MAX_ATTEMPTS - 1) break;
          await new Promise((r) => setTimeout(r, RETRY_MS));
          if (cancelled) return;
        }

        const spec = design?.configData?.spec;
        const source = design?.configData?.source;
        if (!design || !spec) throw new Error('Saved design record is incomplete.');
        if (!isRashguardSource(source)) {
          throw new Error('Saved design is not a rashguard or grappling short.');
        }

        if (cancelled) return;
        setStatus('Generating production PDF...');

        const orderInfo = buildOrderInfo(design);
        // Filename: <order_number>_<product>.pdf (e.g. 1042_short-sleeve-rashguard.pdf)
        const fileName = `${fileNameSlug(orderInfo.orderNumber, 'order')}_${fileNameSlug(
          source,
          'rashguard',
        )}.pdf`;
        // silent=1 (portal-embedded generation): archive only, no download.
        const silent =
          new URLSearchParams(window.location.search).get('silent') === '1';
        const sharedInput = {
          partColors: Object.fromEntries(
            Object.entries(spec.partColors).map(([part, color]) => [part, color.hex]),
          ),
          artworkLayers: buildArtworkLayers(spec, design.configData?.images),
          views: completeViews(design.configData?.renders),
          viewAspect: design.configData?.renders?.aspect,
          orderInfo,
          options: {
            output: silent ? ('archive' as const) : ('save' as const),
            fileName,
          },
        };

        let generated: unknown;
        if (source === 'short-sleeve-rashguard') {
          generated = await generateShortSleeveRashguardArtFile(
            sharedInput as unknown as Parameters<
              typeof generateShortSleeveRashguardArtFile
            >[0],
          );
        } else if (source === 'long-sleeve-rashguard') {
          generated = await generateLongSleeveRashguardArtFile(
            sharedInput as unknown as Parameters<
              typeof generateLongSleeveRashguardArtFile
            >[0],
          );
        } else {
          generated = await generateAdultGrapplingShortArtFile(
            sharedInput as unknown as Parameters<
              typeof generateAdultGrapplingShortArtFile
            >[0],
          );
        }

        // Freeze the exact generated bytes as an immutable version (v1, v2,
        // ...) so the factory portal serves what was actually produced.
        // Best-effort: the download already happened.
        let stored: { version: number } | null = null;
        if (generated instanceof Blob) {
          if (!cancelled) {
            setStatus('Tech pack PDF generated. Archiving a frozen copy...');
          }
          stored = await storeTechPackPdf({
            blob: generated,
            designId: design.id,
            source,
            orderNumber: String(orderInfo.orderNumber ?? ''),
            fileName,
          });
        }

        if (!cancelled) {
          if (silent) {
            setStatus(
              stored
                ? `Tech pack archived as v${stored.version}.`
                : 'The tech pack could not be archived.',
            );
          } else {
            setStatus(
              stored
                ? `Tech pack PDF generated and archived as v${stored.version}. Check your downloads.`
                : 'Tech pack PDF generated. Check your downloads.',
            );
          }
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
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-white p-8 text-center">
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-[0.18em] uppercase">
          DSPLN Tech Pack
        </h1>
        <p className="mt-5 text-sm text-neutral-600">{error ?? status}</p>
      </div>
    </main>
  );
}
