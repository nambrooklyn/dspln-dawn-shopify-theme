import { useEffect, useState } from 'react';

import { generateGiTechPackPageOne } from './configurators/shared/tech-pack';
import type { GiSerializedState, KimonoLogo } from './configurators/gi/gi-state';
import type {
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
      renders?: Partial<
        Record<
          'front' | 'back' | 'left' | 'right' | 'leftBeltEnd' | 'rightBeltEnd',
          string
        >
      >;
  };
};

function apiDesignUrl(id: string) {
  const url = new URL('/api/customer-designs', window.location.origin);
  url.searchParams.set('id', id);
  return url;
}

function savedImageToLogo(image?: SavedLogoImage): KimonoLogo | undefined {
  const imageUrl = image?.dataUrl || image?.shopifyUrl;
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

export function TechPackDownloadPage() {
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
        if (!design || !spec) throw new Error('Saved design record is incomplete.');

        if (cancelled) return;
        setStatus('Generating production PDF...');

        const renders = design.configData?.renders ?? {};
        const frontDataUrl = renders.front || design.thumbnailUrl || '';
        await generateGiTechPackPageOne({
          spec,
          frontDataUrl,
          backDataUrl: renders.back || frontDataUrl,
          leftSideDataUrl: renders.left,
          rightSideDataUrl: renders.right,
          leftBeltEndDataUrl: renders.leftBeltEnd,
          rightBeltEndDataUrl: renders.rightBeltEnd,
          kimonoLogos: mapLogos(design.configData?.images?.kimono),
          pantLogos: mapLogos(design.configData?.images?.pant),
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
