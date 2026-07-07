import { useEffect, useState } from 'react';

import {
  generateRashguardArtFile as generateShortSleeveRashguardArtFile,
  type ArtFileOrderInfo,
  type ArtFileViews,
} from './configurators/short-sleeve-rashguard/rashguard-artfile';
import { generateRashguardArtFile as generateLongSleeveRashguardArtFile } from './configurators/long-sleeve-rashguard/rashguard-artfile';
import { generateRashguardArtFile as generateAdultGrapplingShortArtFile } from './configurators/adult-grappling-short/rashguard-artfile';
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

function buildOrderInfo(id: string): ArtFileOrderInfo {
  const params = new URLSearchParams(window.location.search);
  const orderDate = parseDate(params.get('date'));
  const shipDate = new Date(orderDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    orderDate: formatDate(orderDate),
    shipDate: formatDate(shipDate),
    orderNumber: params.get('order')?.trim() || orderNumberForDesign(id),
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
        const response = await fetch(apiDesignUrl(id), {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(await response.text());

        const payload = (await response.json()) as {
          data?: { design?: SavedDesignRecord };
        };
        const design = payload.data?.design;
        const spec = design?.configData?.spec;
        const source = design?.configData?.source;
        if (!design || !spec) throw new Error('Saved design record is incomplete.');
        if (!isRashguardSource(source)) {
          throw new Error('Saved design is not a rashguard or grappling short.');
        }

        if (cancelled) return;
        setStatus('Generating production PDF...');

        const sharedInput = {
          partColors: Object.fromEntries(
            Object.entries(spec.partColors).map(([part, color]) => [part, color.hex]),
          ),
          artworkLayers: buildArtworkLayers(spec, design.configData?.images),
          views: completeViews(design.configData?.renders),
          viewAspect: design.configData?.renders?.aspect,
          orderInfo: buildOrderInfo(design.id),
          options: {
            output: 'save',
          } as const,
        };

        if (source === 'short-sleeve-rashguard') {
          await generateShortSleeveRashguardArtFile(
            sharedInput as unknown as Parameters<
              typeof generateShortSleeveRashguardArtFile
            >[0],
          );
        } else if (source === 'long-sleeve-rashguard') {
          await generateLongSleeveRashguardArtFile(
            sharedInput as unknown as Parameters<
              typeof generateLongSleeveRashguardArtFile
            >[0],
          );
        } else {
          await generateAdultGrapplingShortArtFile(
            sharedInput as unknown as Parameters<
              typeof generateAdultGrapplingShortArtFile
            >[0],
          );
        }

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
