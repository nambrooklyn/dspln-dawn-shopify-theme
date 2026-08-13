import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { ImagePlus, LoaderCircle, Send, X } from 'lucide-react';

import {
  BELT_EMBROIDERY_DEFAULT,
  BELT_COLOR_SWATCHES,
  GI_DEFAULT_COLORS,
  GI_COLOR_SWATCHES,
  GI_PARTS,
  GI_PART_PRICES,
  KIMONO_SUBPART_DEFAULT,
  PANT_SUBPART_DEFAULT,
  type CameraView,
  type GiPart,
  type KimonoLogoSlot,
  type KimonoSubPart,
  type PantLogoSlot,
  type PantSubPart,
} from '../configurators/gi/gi-config';
import { useGiState, type KimonoLogo } from '../configurators/gi/gi-state';
import { uploadArtworkImage } from '../configurators/shared/preview-upload';

/**
 * DSPLN Design Assistant — customer-facing chat that designs the gi live.
 *
 * The model runs behind /api/design-assistant (key stays server-side); tool
 * calls come back here and are executed directly against the configurator
 * state, so the customer watches the 3D gi change as the assistant works.
 *
 * Dev-store only for now: renders on Netlify branch deploys (dev--*) or with
 * ?assistant=0 remains available as an emergency per-page opt-out.
 */

const MAX_TOOL_ROUNDS = 6;
const MAX_ARTWORK_BYTES = 6_000_000;

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

interface ChatBubble {
  role: 'user' | 'assistant';
  text: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface AttachedArtwork {
  id: string;
  url: string;
  previewUrl: string;
  filename: string;
  width: number;
  height: number;
}

interface ArtworkAgentResponse {
  artwork?: {
    id: string;
    url: string;
    filename: string;
    width: number;
    height: number;
    operation: 'generate' | 'edit';
  };
  message?: string;
  requestId?: string;
}

const readArtworkFile = async (file: File) => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Artwork could not be read'));
    reader.readAsDataURL(file);
  });

  const dimensions = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Artwork is not a valid image'));
      image.src = dataUrl;
    },
  );

  return { dataUrl, dimensions };
};

const removeEdgeConnectedLightBackground = async (
  dataUrl: string,
  cleanupStrength = 0,
) => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error('Artwork could not be processed'));
    next.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  if (canvas.width * canvas.height > 20_000_000) {
    throw new Error('Artwork is too large to process');
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Artwork could not be processed');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = pixels;
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;

  const isLightBackground = (index: number) => {
    const offset = index * 4;
    if (data[offset + 3] === 0) return true;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const darkest = Math.min(red, green, blue);
    const lightest = Math.max(red, green, blue);
    const minimumBrightness = Math.round(224 - cleanupStrength * 1.35);
    const maximumColorSpread = Math.round(24 + cleanupStrength * 0.36);
    return (
      darkest >= minimumBrightness &&
      lightest - darkest <= maximumColorSpread
    );
  };
  const enqueue = (index: number) => {
    if (visited[index] || !isLightBackground(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    data[index * 4 + 3] = 0;
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  // A stronger cleanup also removes disconnected neutral pixels, which is
  // necessary for isolated drop-shadow remnants. Recompute from the original
  // for every slider change so cleanup never compounds destructively.
  if (cleanupStrength > 0) {
    for (let index = 0; index < width * height; index += 1) {
      if (isLightBackground(index)) data[index * 4 + 3] = 0;
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
};

const requestArtworkRevision = async (payload: {
  operation: 'generate' | 'edit';
  prompt: string;
  imageUrl?: string;
  filename?: string;
}): Promise<AttachedArtwork> => {
  const response = await fetch('/api/artwork-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as ArtworkAgentResponse;
  if (!response.ok || !data.artwork) {
    const requestSuffix = data.requestId ? ` (reference ${data.requestId})` : '';
    throw new Error(
      `${data.message || 'The artwork revision did not finish. Please retry it.'}${requestSuffix}`,
    );
  }
  return {
    id: data.artwork.id,
    url: data.artwork.url,
    previewUrl: data.artwork.url,
    filename: data.artwork.filename,
    width: data.artwork.width,
    height: data.artwork.height,
  };
};

export function shouldShowDesignAssistant(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('assistant');
    if (flag === '0') return false;
    return true;
  } catch {
    return true;
  }
}

const garmentHex = (name: string) =>
  GI_COLOR_SWATCHES.find(
    (swatch) => swatch.name.toLowerCase() === name.trim().toLowerCase(),
  )?.hex ?? null;

const beltHex = (name: string) =>
  BELT_COLOR_SWATCHES.find(
    (swatch) => swatch.name.toLowerCase() === name.trim().toLowerCase(),
  )?.hex ?? null;

const nameOfHex = (hex: string) =>
  [...GI_COLOR_SWATCHES, ...BELT_COLOR_SWATCHES].find(
    (swatch) => swatch.hex.toLowerCase() === hex.toLowerCase(),
  )?.name ?? hex;

interface DesignAssistantProps {
  placement?: 'desktop' | 'mobile';
  productKey?: GiAssistantProductKey;
  useProductState?: () => unknown;
  productContext?: AssistantProductContext;
  runProductTool?: (
    name: string,
    input: Record<string, unknown>,
    helpers: { getArtwork: (id: string) => AttachedArtwork | undefined },
  ) => Promise<string | null>;
}

export interface AssistantProductContext {
  id: string;
  name: string;
  family: 'gi' | 'rashguard';
  allowedParts: string[];
  colorTargets: string[];
  artworkTargets: string[];
  supportsBeltText: boolean;
  audience: 'adult' | 'women' | 'kids';
  colorMode: 'fixed-palette' | 'any-hex';
  colorOptionsByTarget: Record<string, string[]>;
}

export type GiAssistantProductKey =
  | 'mens'
  | 'womens'
  | 'kids'
  | 'mens-kimono'
  | 'kids-kimono'
  | 'mens-pant'
  | 'kids-pant'
  | 'mens-belt'
  | 'kids-belt';

const GI_ASSISTANT_PROFILES: Record<
  GiAssistantProductKey,
  {
    name: string;
    allowedParts: GiPart[];
    colorTargets: string[];
    artworkTargets: string[];
    supportsBeltText: boolean;
    audience: 'adult' | 'women' | 'kids';
  }
> = {
  mens: {
    name: "Men's Custom GI Suit",
    allowedParts: ['jacket', 'pants', 'belt'],
    colorTargets: ['kimono-body', 'kimono-lapel', 'kimono-reinforcement', 'kimono-stitching', 'pant-body', 'pant-reinforcement', 'pant-stitching', 'pant-drawcord', 'belt'],
    artworkTargets: ['kimono:left-chest', 'kimono:right-chest', 'kimono:left-sleeve', 'kimono:right-sleeve', 'kimono:back', 'pant:left-pant', 'pant:right-pant'],
    supportsBeltText: true,
    audience: 'adult',
  },
  womens: {
    name: "Women's Custom GI Suit",
    allowedParts: ['jacket', 'pants', 'belt'],
    colorTargets: ['kimono-body', 'kimono-lapel', 'kimono-reinforcement', 'kimono-stitching', 'pant-body', 'pant-reinforcement', 'pant-stitching', 'pant-drawcord', 'belt'],
    artworkTargets: ['kimono:left-chest', 'kimono:right-chest', 'kimono:left-sleeve', 'kimono:right-sleeve', 'kimono:back', 'pant:left-pant', 'pant:right-pant'],
    supportsBeltText: true,
    audience: 'women',
  },
  kids: {
    name: "Kids' Custom GI Suit",
    allowedParts: ['jacket', 'pants', 'belt'],
    colorTargets: ['kimono-body', 'kimono-lapel', 'kimono-reinforcement', 'kimono-stitching', 'pant-body', 'pant-reinforcement', 'pant-stitching', 'pant-drawcord', 'belt'],
    artworkTargets: ['kimono:left-chest', 'kimono:right-chest', 'kimono:left-sleeve', 'kimono:right-sleeve', 'kimono:back', 'pant:left-pant', 'pant:right-pant'],
    supportsBeltText: true,
    audience: 'kids',
  },
  'mens-kimono': {
    name: "Men's Custom Kimono",
    allowedParts: ['jacket'],
    colorTargets: ['kimono-body', 'kimono-lapel', 'kimono-reinforcement', 'kimono-stitching'],
    artworkTargets: ['kimono:left-chest', 'kimono:right-chest', 'kimono:left-sleeve', 'kimono:right-sleeve', 'kimono:back'],
    supportsBeltText: false,
    audience: 'adult',
  },
  'kids-kimono': {
    name: "Kids' Custom Kimono",
    allowedParts: ['jacket'],
    colorTargets: ['kimono-body', 'kimono-lapel', 'kimono-reinforcement', 'kimono-stitching'],
    artworkTargets: ['kimono:left-chest', 'kimono:right-chest', 'kimono:left-sleeve', 'kimono:right-sleeve', 'kimono:back'],
    supportsBeltText: false,
    audience: 'kids',
  },
  'mens-pant': {
    name: "Men's Custom BJJ Pant",
    allowedParts: ['pants'],
    colorTargets: ['pant-body', 'pant-reinforcement', 'pant-stitching', 'pant-drawcord'],
    artworkTargets: ['pant:left-pant', 'pant:right-pant'],
    supportsBeltText: false,
    audience: 'adult',
  },
  'kids-pant': {
    name: "Kids' Custom BJJ Pant",
    allowedParts: ['pants'],
    colorTargets: ['pant-body', 'pant-reinforcement', 'pant-stitching', 'pant-drawcord'],
    artworkTargets: ['pant:left-pant', 'pant:right-pant'],
    supportsBeltText: false,
    audience: 'kids',
  },
  'mens-belt': {
    name: "Men's Custom BJJ Belt",
    allowedParts: ['belt'],
    colorTargets: ['belt'],
    artworkTargets: [],
    supportsBeltText: true,
    audience: 'adult',
  },
  'kids-belt': {
    name: "Kids' Custom BJJ Belt",
    allowedParts: ['belt'],
    colorTargets: ['belt'],
    artworkTargets: [],
    supportsBeltText: true,
    audience: 'kids',
  },
};

export function DesignAssistant({
  placement = 'mobile',
  productKey = 'mens',
  useProductState,
  productContext,
  runProductTool,
}: DesignAssistantProps) {
  const stateHook = useProductState ?? useGiState;
  const state = stateHook() as ReturnType<typeof useGiState>;
  const productProfile = GI_ASSISTANT_PROFILES[productKey];
  const activeProductContext: AssistantProductContext = productContext ?? {
    id: productKey,
    name: productProfile.name,
    family: 'gi',
    allowedParts: productProfile.allowedParts,
    colorTargets: productProfile.colorTargets,
    artworkTargets: productProfile.artworkTargets,
    supportsBeltText: productProfile.supportsBeltText,
    audience: productProfile.audience,
    colorMode: 'fixed-palette',
    colorOptionsByTarget: Object.fromEntries(
      productProfile.colorTargets.map((target) => [
        target,
        (target === 'belt' ? BELT_COLOR_SWATCHES : GI_COLOR_SWATCHES).map(
          (swatch) => swatch.name,
        ),
      ]),
    ),
  };
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingArtwork, setUploadingArtwork] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [artworkError, setArtworkError] = useState('');
  const [attachedArtwork, setAttachedArtwork] = useState<AttachedArtwork | null>(null);
  const [originalAttachedArtwork, setOriginalAttachedArtwork] =
    useState<AttachedArtwork | null>(null);
  const [cleanupStrength, setCleanupStrength] = useState(0);
  const [cleanupDirty, setCleanupDirty] = useState(false);
  const [cleanupEditorOpen, setCleanupEditorOpen] = useState(false);
  const conversationRef = useRef<ApiMessage[]>([]);
  const artworkRef = useRef(new Map<string, AttachedArtwork>());
  const artworkInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [bubbles, busy]);

  const openChat = useCallback(() => {
    setOpen(true);
    setBubbles((prev) =>
      prev.length > 0
        ? prev
        : [
            {
              role: 'assistant',
              text: `Tell me how you want your ${activeProductContext.name} to look. I can change its available colors${activeProductContext.supportsBeltText ? ', personalize the belt' : ''}${activeProductContext.artworkTargets.length ? ', create or clean up artwork, remove backgrounds, and place logos on the product' : ''}. Tell me what to change and I’ll apply it live in 3D.`,
            },
          ],
    );
  }, [activeProductContext]);

  const processArtworkFile = useCallback(async (file: File) => {
    setArtworkError('');
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setArtworkError('Please choose a PNG or JPEG image.');
      return;
    }
    if (file.size > MAX_ARTWORK_BYTES) {
      setArtworkError('Artwork must be under 6 MB.');
      return;
    }

    setUploadingArtwork(true);
    try {
      const { dataUrl, dimensions } = await readArtworkFile(file);
      const hostedUrl = await uploadArtworkImage(dataUrl);
      if (!hostedUrl) throw new Error('Artwork upload failed');
      const artwork: AttachedArtwork = {
        id: crypto.randomUUID(),
        url: hostedUrl,
        previewUrl: dataUrl,
        filename: file.name,
        width: dimensions.width,
        height: dimensions.height,
      };
      artworkRef.current.set(artwork.id, artwork);
      setAttachedArtwork(artwork);
      setOriginalAttachedArtwork(artwork);
      setCleanupStrength(0);
      setCleanupDirty(false);
      setCleanupEditorOpen(false);
    } catch {
      setArtworkError('I could not upload that image. Please try another file.');
    } finally {
      setUploadingArtwork(false);
    }
  }, []);

  const previewBackgroundCleanup = useCallback(async (strength: number) => {
    if (!originalAttachedArtwork || uploadingArtwork) return null;
    setArtworkError('');
    setUploadingArtwork(true);
    try {
      const dataUrl = await removeEdgeConnectedLightBackground(
        originalAttachedArtwork.previewUrl,
        strength,
      );
      const artwork: AttachedArtwork = {
        ...originalAttachedArtwork,
        id: `preview-${crypto.randomUUID()}`,
        previewUrl: dataUrl,
        filename:
          originalAttachedArtwork.filename.replace(/\.[^.]+$/, '') +
          '-transparent.png',
      };
      setAttachedArtwork(artwork);
      setCleanupStrength(strength);
      setCleanupDirty(true);
      return artwork;
    } catch {
      setArtworkError('I could not clean up this background. You can undo and use the original.');
      return null;
    } finally {
      setUploadingArtwork(false);
    }
  }, [originalAttachedArtwork, uploadingArtwork]);

  const saveBackgroundCleanup = useCallback(async (
    candidate?: AttachedArtwork | null,
  ) => {
    const artworkToSave = candidate ?? attachedArtwork;
    if (!artworkToSave || (!candidate && !cleanupDirty) || uploadingArtwork) return;
    setUploadingArtwork(true);
    try {
      const hostedUrl = await uploadArtworkImage(artworkToSave.previewUrl);
      if (!hostedUrl) throw new Error('Artwork upload failed');
      const artwork = {
        ...artworkToSave,
        id: crypto.randomUUID(),
        url: hostedUrl,
      };
      artworkRef.current.set(artwork.id, artwork);
      setAttachedArtwork(artwork);
      setCleanupDirty(false);
    } catch {
      setArtworkError('I could not save the cleaned artwork. Please try again.');
    } finally {
      setUploadingArtwork(false);
    }
  }, [attachedArtwork, cleanupDirty, uploadingArtwork]);

  const attachArtwork = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await processArtworkFile(file);
  }, [processArtworkFile]);

  const handleArtworkDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (placement !== 'desktop') return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  }, [placement]);

  const handleArtworkDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (placement !== 'desktop') return;
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragActive(false);
  }, [placement]);

  const handleArtworkDrop = useCallback(async (event: DragEvent<HTMLElement>) => {
    if (placement !== 'desktop') return;
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = Array.from(event.dataTransfer.files).find((candidate) =>
      ['image/png', 'image/jpeg'].includes(candidate.type),
    );
    if (!file) {
      setArtworkError('Please drop a PNG or JPEG image.');
      openChat();
      return;
    }
    openChat();
    await processArtworkFile(file);
  }, [openChat, placement, processArtworkFile]);

  // ---- tool execution against live configurator state ----

  const runTool = useCallback(
    async (name: string, toolInput: Record<string, unknown>): Promise<string> => {
      if (runProductTool) {
        const productResult = await runProductTool(name, toolInput, {
          getArtwork: (id) => artworkRef.current.get(id),
        });
        if (productResult !== null) return productResult;
      }
      const s = stateRef.current;
      switch (name) {
        case 'get_design': {
          const included = productProfile.allowedParts.filter(
            (part) => s.partVisibility[part],
          );
          const logoCount = Object.values(s.kimonoLogos).filter(Boolean).length;
          return JSON.stringify({
            colorMode: activeProductContext.colorMode,
            availableColorsByTarget: activeProductContext.colorOptionsByTarget,
            includedParts: included,
            partPrices: GI_PART_PRICES,
            kimonoColors: Object.fromEntries(
              Object.entries(s.kimonoSubColors).map(([k, v]) => [k, nameOfHex(v)]),
            ),
            pantColors: Object.fromEntries(
              Object.entries(s.pantSubColors).map(([k, v]) => [k, nameOfHex(v)]),
            ),
            beltColor: nameOfHex(s.partColors.belt),
            sizes: { kimono: s.kimonoSize || null, pant: s.pantSize || null, belt: s.beltSize || null },
            beltText: {
              left: s.beltEmbroidery.leftEnd || null,
              right: s.beltEmbroidery.rightEnd || null,
            },
            kimonoLogosPresent: logoCount,
            artworkPlacements: {
              kimono: Object.entries(s.kimonoLogos)
                .filter(([, logo]) => Boolean(logo))
                .map(([slot, logo]) => ({ slot, filename: logo?.filename })),
              pant: Object.entries(s.pantLogos)
                .filter(([, logo]) => Boolean(logo))
                .map(([slot, logo]) => ({ slot, filename: logo?.filename })),
            },
          });
        }
        case 'reset_design': {
          const allowedParts = new Set(productProfile.allowedParts);

          for (const part of GI_PARTS) {
            const included = allowedParts.has(part);
            s.setPartVisible(part, included);
            s.setScenePartVisible(part, included);
            s.setPartColor(part, GI_DEFAULT_COLORS[part]);
          }
          for (const [subPart, color] of Object.entries(KIMONO_SUBPART_DEFAULT)) {
            s.setKimonoSubColor(subPart as KimonoSubPart, color);
          }
          for (const [subPart, color] of Object.entries(PANT_SUBPART_DEFAULT)) {
            s.setPantSubColor(subPart as PantSubPart, color);
          }

          s.setKimonoSize('');
          s.setPantSize('');
          s.setBeltSize('');
          s.setCustomSizeNotes('');
          s.setBeltEmbroidery({ ...BELT_EMBROIDERY_DEFAULT });

          for (const slot of Object.keys(s.kimonoLogos)) {
            s.removeKimonoLogo(slot as KimonoLogoSlot);
          }
          for (const slot of Object.keys(s.kimonoLogoAnchors)) {
            s.setKimonoLogoAnchor(slot as KimonoLogoSlot, null);
          }
          for (const slot of Object.keys(s.pantLogos)) {
            s.removePantLogo(slot as PantLogoSlot);
          }
          for (const layer of s.layers) s.removeLayer(layer.id);
          for (const layer of s.textLayers) s.removeTextLayer(layer.id);

          s.selectLayer(null);
          s.setSelectedPart(productProfile.allowedParts[0] ?? GI_PARTS[0]);
          s.setCameraView('front');

          return JSON.stringify({
            ok: true,
            reset: true,
            product: productProfile.name,
          });
        }
        case 'set_panel_color': {
          const target = String(toolInput.target ?? '');
          const colorName = String(toolInput.color ?? '');
          if (!productProfile.colorTargets.includes(target)) {
            return JSON.stringify({ ok: false, error: `${target} is not available on ${productProfile.name}.` });
          }
          if (target === 'belt') {
            const hex = beltHex(colorName);
            if (!hex) return JSON.stringify({ ok: false, error: `"${colorName}" is not a belt color. Belt colors: White, Blue, Purple, Brown, Black.` });
            s.setPartColor('belt', hex);
            return JSON.stringify({ ok: true });
          }
          const hex = garmentHex(colorName);
          if (!hex) return JSON.stringify({ ok: false, error: `"${colorName}" is not in the garment palette.` });
          const [part, sub] = target.split('-') as ['kimono' | 'pant', string];
          if (part === 'kimono') {
            s.setKimonoSubColor(sub as KimonoSubPart, hex);
            if (sub === 'body') s.setPartColor('jacket', hex);
          } else if (part === 'pant') {
            s.setPantSubColor(sub as PantSubPart, hex);
            if (sub === 'body') s.setPartColor('pants', hex);
          } else {
            return JSON.stringify({ ok: false, error: `Unknown target ${target}` });
          }
          return JSON.stringify({ ok: true });
        }
        case 'set_part_included': {
          const part = String(toolInput.part ?? '') as GiPart;
          if (!productProfile.allowedParts.includes(part)) {
            return JSON.stringify({ ok: false, error: `${part} is not part of ${productProfile.name}.` });
          }
          s.setPartVisible(part, Boolean(toolInput.included));
          return JSON.stringify({ ok: true });
        }
        case 'set_sizes': {
          if (productProfile.allowedParts.includes('jacket') && typeof toolInput.kimono === 'string') s.setKimonoSize(toolInput.kimono);
          if (productProfile.allowedParts.includes('pants') && typeof toolInput.pant === 'string') s.setPantSize(toolInput.pant);
          if (productProfile.allowedParts.includes('belt') && typeof toolInput.belt === 'string') s.setBeltSize(toolInput.belt);
          return JSON.stringify({ ok: true });
        }
        case 'set_belt_text': {
          if (!productProfile.supportsBeltText) {
            return JSON.stringify({ ok: false, error: `Belt text is not available on ${productProfile.name}.` });
          }
          const side = toolInput.side === 'right' ? 'right' : 'left';
          const text = String(toolInput.text ?? '').slice(0, 18);
          const patch: Record<string, string> = {};
          patch[side === 'left' ? 'leftEnd' : 'rightEnd'] = text;
          if (typeof toolInput.font === 'string') {
            patch[side === 'left' ? 'leftFont' : 'rightFont'] = toolInput.font;
          }
          if (typeof toolInput.threadColor === 'string') {
            const hex = garmentHex(toolInput.threadColor);
            if (hex) patch[side === 'left' ? 'leftThreadColor' : 'rightThreadColor'] = hex;
          }
          s.setBeltEmbroidery(patch);
          return JSON.stringify({ ok: true, renderedAs: text.toUpperCase() });
        }
        case 'focus_camera': {
          const view = String(toolInput.view ?? 'front') as CameraView;
          s.setCameraView(view);
          return JSON.stringify({ ok: true });
        }
        case 'apply_uploaded_artwork': {
          const artworkId = String(toolInput.artworkId ?? '');
          const target = String(toolInput.target ?? '');
          if (!productProfile.artworkTargets.includes(target)) {
            return JSON.stringify({ ok: false, error: `${target} is not available on ${productProfile.name}.` });
          }
          const artwork = artworkRef.current.get(artworkId);
          if (!artwork) {
            return JSON.stringify({ ok: false, error: 'Uploaded artwork not found.' });
          }
          const [part, slot] = target.split(':') as ['kimono' | 'pant', string];
          const logo: KimonoLogo = {
            imageUrl: artwork.url,
            imageWidth: artwork.width,
            imageHeight: artwork.height,
            filename: artwork.filename,
          };
          if (
            part === 'kimono' &&
            ['left-chest', 'right-chest', 'left-sleeve', 'right-sleeve', 'back'].includes(slot)
          ) {
            s.setKimonoLogo(slot as KimonoLogoSlot, logo);
            s.setCameraView(
              slot === 'back'
                ? 'back'
                : slot === 'left-sleeve'
                  ? 'left'
                  : slot === 'right-sleeve'
                    ? 'right'
                    : 'front',
            );
            return JSON.stringify({
              ok: true,
              appliedTo: target,
              addedPrice: slot === 'back' ? 25 : 10,
            });
          }
          if (part === 'pant' && ['left-pant', 'right-pant'].includes(slot)) {
            s.setPantLogo(slot as PantLogoSlot, logo);
            s.setCameraView('front');
            return JSON.stringify({ ok: true, appliedTo: target, addedPrice: 10 });
          }
          return JSON.stringify({ ok: false, error: `Unknown artwork target ${target}` });
        }
        case 'manage_existing_artwork': {
          const action = String(toolInput.action ?? '');
          const source = String(toolInput.source ?? '');
          const target = String(toolInput.target ?? '');
          if (!productProfile.artworkTargets.includes(source)) {
            return JSON.stringify({ ok: false, error: `${source} is not available on ${productProfile.name}.` });
          }
          if (action !== 'remove' && !productProfile.artworkTargets.includes(target)) {
            return JSON.stringify({ ok: false, error: `${target} is not available on ${productProfile.name}.` });
          }
          const validKimonoSlots = ['left-chest', 'right-chest', 'left-sleeve', 'right-sleeve', 'back'];
          const validPantSlots = ['left-pant', 'right-pant'];

          const readPlacement = (placement: string) => {
            const [part, slot] = placement.split(':');
            if (part === 'kimono' && validKimonoSlots.includes(slot)) {
              return s.kimonoLogos[slot as KimonoLogoSlot];
            }
            if (part === 'pant' && validPantSlots.includes(slot)) {
              return s.pantLogos[slot as PantLogoSlot];
            }
            return undefined;
          };
          const removePlacement = (placement: string) => {
            const [part, slot] = placement.split(':');
            if (part === 'kimono' && validKimonoSlots.includes(slot)) {
              s.removeKimonoLogo(slot as KimonoLogoSlot);
              return true;
            }
            if (part === 'pant' && validPantSlots.includes(slot)) {
              s.removePantLogo(slot as PantLogoSlot);
              return true;
            }
            return false;
          };
          const writePlacement = (placement: string, logo: KimonoLogo) => {
            const [part, slot] = placement.split(':');
            if (part === 'kimono' && validKimonoSlots.includes(slot)) {
              s.setKimonoLogo(slot as KimonoLogoSlot, logo);
              s.setCameraView(slot === 'back' ? 'back' : slot === 'left-sleeve' ? 'left' : slot === 'right-sleeve' ? 'right' : 'front');
              return true;
            }
            if (part === 'pant' && validPantSlots.includes(slot)) {
              s.setPantLogo(slot as PantLogoSlot, logo);
              s.setCameraView('front');
              return true;
            }
            return false;
          };
          const priceForPlacement = (placement: string) =>
            placement === 'kimono:back' ? 25 : 10;

          const logo = readPlacement(source);
          if (!logo) {
            return JSON.stringify({ ok: false, error: `No artwork is placed at ${source}.` });
          }
          if (action === 'remove') {
            removePlacement(source);
            return JSON.stringify({ ok: true, action, source, removedPrice: priceForPlacement(source) });
          }
          if (action !== 'move' && action !== 'copy') {
            return JSON.stringify({ ok: false, error: 'Action must be move, copy, or remove.' });
          }
          if (!target || target === source) {
            return JSON.stringify({ ok: false, error: 'Choose a different valid target placement.' });
          }
          const replacedExisting = Boolean(readPlacement(target));
          if (!writePlacement(target, logo)) {
            return JSON.stringify({ ok: false, error: `Unknown artwork target ${target}.` });
          }
          if (action === 'move') removePlacement(source);
          return JSON.stringify({
            ok: true,
            action,
            source,
            target,
            filename: logo.filename,
            replacedExisting,
            sourcePrice: priceForPlacement(source),
            targetPrice: priceForPlacement(target),
          });
        }
        case 'create_artwork': {
          const prompt = String(toolInput.prompt ?? '').trim();
          if (!prompt) {
            return JSON.stringify({ ok: false, error: 'An artwork prompt is required.' });
          }
          try {
            const artwork = await requestArtworkRevision({
              operation: 'generate',
              prompt,
            });
            artworkRef.current.set(artwork.id, artwork);
            setBubbles((prev) => [
              ...prev,
              {
                role: 'assistant',
                text: 'New generated artwork revision',
                imageUrl: artwork.previewUrl,
                imageAlt: artwork.filename,
              },
            ]);
            return JSON.stringify({
              ok: true,
              artworkId: artwork.id,
              filename: artwork.filename,
              width: artwork.width,
              height: artwork.height,
              originalPreserved: true,
            });
          } catch (error) {
            return JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'Artwork generation failed.',
            });
          }
        }
        case 'edit_uploaded_artwork': {
          const artworkId = String(toolInput.artworkId ?? '');
          const prompt = String(toolInput.prompt ?? '').trim();
          const source = artworkRef.current.get(artworkId);
          if (!source) {
            return JSON.stringify({ ok: false, error: 'Source artwork not found.' });
          }
          if (!prompt) {
            return JSON.stringify({ ok: false, error: 'An edit instruction is required.' });
          }
          try {
            const artwork = await requestArtworkRevision({
              operation: 'edit',
              prompt,
              imageUrl: source.url,
              filename: source.filename,
            });
            artworkRef.current.set(artwork.id, artwork);
            setBubbles((prev) => [
              ...prev,
              {
                role: 'assistant',
                text: 'New edited artwork revision',
                imageUrl: artwork.previewUrl,
                imageAlt: artwork.filename,
              },
            ]);
            return JSON.stringify({
              ok: true,
              artworkId: artwork.id,
              sourceArtworkId: artworkId,
              filename: artwork.filename,
              width: artwork.width,
              height: artwork.height,
              originalPreserved: true,
            });
          } catch (error) {
            return JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'Artwork edit failed.',
            });
          }
        }
        default:
          return JSON.stringify({ ok: false, error: `Unknown tool ${name}` });
      }
    },
    [activeProductContext, productProfile, runProductTool],
  );

  // ---- conversation loop ----

  const send = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const text = input.trim();
      const artwork = attachedArtwork;
      if ((!text && !artwork) || busy || uploadingArtwork) return;
      const userText =
        text || 'Please inspect this artwork and ask me where I want it placed.';
      setInput('');
      setAttachedArtwork(null);
      setOriginalAttachedArtwork(null);
      setCleanupStrength(0);
      setCleanupDirty(false);
      setCleanupEditorOpen(false);
      setArtworkError('');
      setBusy(true);
      setBubbles((prev) => [
        ...prev,
        {
          role: 'user',
          text: userText,
          imageUrl: artwork?.previewUrl,
          imageAlt: artwork?.filename,
        },
      ]);
      const content: ApiMessage['content'] = artwork
        ? [
            { type: 'text', text: userText },
            {
              type: 'image',
              imageUrl: artwork.url,
              artworkId: artwork.id,
              filename: artwork.filename,
              width: artwork.width,
              height: artwork.height,
            },
          ]
        : userText;
      conversationRef.current = [
        ...conversationRef.current,
        { role: 'user', content },
      ];

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
          const response = await fetch('/api/design-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: conversationRef.current,
              productContext: activeProductContext,
            }),
          });
          if (!response.ok) {
            const detail = (await response.json().catch(() => null)) as
              | { message?: string }
              | null;
            setBubbles((prev) => [
              ...prev,
              {
                role: 'assistant',
                text:
                  detail?.message ??
                  'Sorry — I had trouble responding. Please try again in a moment.',
              },
            ]);
            return;
          }
          const { data } = (await response.json()) as {
            data: { content: ContentBlock[]; stopReason: string };
          };

          conversationRef.current = [
            ...conversationRef.current,
            { role: 'assistant', content: data.content as Array<Record<string, unknown>> },
          ];

          const texts = data.content
            .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
            .map((block) => block.text.trim())
            .filter(Boolean);
          if (texts.length > 0) {
            setBubbles((prev) => [
              ...prev,
              ...texts.map((t) => ({ role: 'assistant' as const, text: t })),
            ]);
          }

          const toolUses = data.content.filter(
            (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
              block.type === 'tool_use',
          );
          if (data.stopReason !== 'tool_use' || toolUses.length === 0) return;

          const toolResults = await Promise.all(
            toolUses.map(async (tool) => ({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: await runTool(tool.name, tool.input),
            })),
          );
          conversationRef.current = [
            ...conversationRef.current,
            { role: 'user', content: toolResults },
          ];
        }
      } catch {
        setBubbles((prev) => [
          ...prev,
          { role: 'assistant', text: 'Sorry — something went wrong. Please try again.' },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [activeProductContext, attachedArtwork, busy, input, runTool, uploadingArtwork],
  );

  // ---- UI ----

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={openChat}
          onDragEnter={handleArtworkDragOver}
          onDragOver={handleArtworkDragOver}
          onDragLeave={handleArtworkDragLeave}
          onDrop={handleArtworkDrop}
          aria-label="Open design assistant"
          className={
            placement === 'desktop'
              ? `absolute top-3 left-3 z-[70] flex h-12 w-[min(17rem,calc(100%-1.5rem))] items-center justify-between gap-3 rounded-xl border bg-white px-4 text-[11px] font-semibold tracking-[0.12em] text-[#1c1b1b] uppercase shadow-md hover:bg-[#faf8f5] ${dragActive ? 'border-[#5c0000] ring-4 ring-[#5c0000]/20' : 'border-[#e3ded7]'}`
              : 'flex h-12 w-full items-center justify-between gap-3 bg-white px-4 text-[11px] font-semibold tracking-[0.12em] text-[#1c1b1b] uppercase hover:bg-[#faf8f5]'
          }
        >
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#5c0000] text-[8px] font-bold tracking-[-0.04em] text-white"
              aria-hidden="true"
            >
              AI
            </span>
            {placement === 'desktop' && dragActive
              ? 'Drop image to upload'
              : 'Design Assistant'}
          </span>
          {placement === 'mobile' ? (
            <span className="text-lg text-[#8a8580]" aria-hidden="true">+</span>
          ) : (
            <span className="text-lg text-[#8a8580]" aria-hidden="true">&#8964;</span>
          )}
        </button>
      ) : (
        <div
          onDragEnter={handleArtworkDragOver}
          onDragOver={handleArtworkDragOver}
          onDragLeave={handleArtworkDragLeave}
          onDrop={handleArtworkDrop}
          className={
            placement === 'desktop'
              ? `absolute top-3 left-3 z-[70] flex h-[min(28rem,calc(100%-1.5rem))] w-[min(17rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl ${dragActive ? 'border-[#5c0000] ring-4 ring-[#5c0000]/20' : 'border-[#e3ded7]'}`
              : 'fixed inset-x-0 bottom-0 z-[80] flex h-[min(52dvh,30rem)] w-full flex-col overflow-hidden rounded-t-3xl border border-[#e3ded7] bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl'
          }
        >
          {placement === 'desktop' && dragActive ? (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-white/90 px-5 text-center text-xs font-semibold tracking-[0.12em] text-[#5c0000] uppercase">
              Drop image to attach
            </div>
          ) : null}
          {placement === 'mobile' ? (
            <div className="flex h-6 shrink-0 items-center justify-center bg-[#faf8f5]">
              <span className="h-1 w-10 rounded-full bg-[#c9c3bc]" />
            </div>
          ) : null}
          <div className="flex items-center justify-between border-b border-[#eee9e2] bg-[#faf8f5] px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#1c1b1b] uppercase">
                Design Assistant
              </p>
              <p className="text-[10px] text-[#8a8580]">
                Changes appear live on your gi
              </p>
            </div>
            <button
              type="button"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 text-[#8a8580] hover:bg-[#f0ece6]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            {bubbles.map((bubble, index) => (
              <div
                key={index}
                className={
                  bubble.role === 'user'
                    ? 'ml-8 rounded-2xl rounded-br-md bg-[#1c1b1b] px-3.5 py-2 text-[13px] leading-snug text-white'
                    : 'mr-8 rounded-2xl rounded-bl-md bg-[#f4f1ec] px-3.5 py-2 text-[13px] leading-snug text-[#1c1b1b]'
                }
              >
                {bubble.imageUrl ? (
                  <img
                    src={bubble.imageUrl}
                    alt={bubble.imageAlt ?? 'Uploaded artwork'}
                    className="mb-2 max-h-32 w-full rounded-lg bg-white/90 object-contain"
                  />
                ) : null}
                {bubble.text}
              </div>
            ))}
            {busy ? (
              <div className="mr-8 flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-[#f4f1ec] px-3.5 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a8580]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a8580] [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a8580] [animation-delay:240ms]" />
              </div>
            ) : null}
          </div>

          <form onSubmit={send} className="border-t border-[#eee9e2] p-2.5">
            {attachedArtwork ? (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#e3ded7] bg-[#faf8f5] p-2">
                <button
                  type="button"
                  onClick={() => cleanupStrength > 0 && setCleanupEditorOpen(true)}
                  aria-label={cleanupStrength > 0 ? 'Open larger cleanup preview' : undefined}
                  className="shrink-0"
                >
                  <img
                    src={attachedArtwork.previewUrl}
                    alt={attachedArtwork.filename}
                    className="h-12 w-12 rounded-lg object-contain"
                    style={{
                      backgroundColor: '#fff',
                      backgroundImage:
                        'linear-gradient(45deg, #e7e3dd 25%, transparent 25%), linear-gradient(-45deg, #e7e3dd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e7e3dd 75%), linear-gradient(-45deg, transparent 75%, #e7e3dd 75%)',
                      backgroundSize: '10px 10px',
                      backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                    }}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-[#1c1b1b]">
                    {attachedArtwork.filename}
                  </p>
                  <p className="text-[10px] text-[#8a8580]">
                    {attachedArtwork.width} × {attachedArtwork.height}px
                  </p>
                  <div className="mt-1 flex min-w-0 gap-2">
                    {cleanupStrength === 0 ? (
                      <button
                        type="button"
                        onClick={() => void previewBackgroundCleanup(1).then(async (artwork) => {
                          await saveBackgroundCleanup(artwork);
                          if (artwork) setCleanupEditorOpen(true);
                        })}
                        disabled={uploadingArtwork}
                        className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-[#5c0000] px-2.5 text-[9px] font-semibold tracking-[0.02em] text-white hover:bg-[#760000] disabled:opacity-40"
                      >
                        {uploadingArtwork ? 'Removing…' : 'Remove background'}
                      </button>
                    ) : originalAttachedArtwork ? (
                      <>
                        <label className="min-w-0 flex-1 text-[8px] font-semibold text-[#5c0000]">
                          <span className="flex justify-between"><span>Cleanup strength</span><span>{cleanupStrength}%</span></span>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            value={cleanupStrength}
                            disabled={uploadingArtwork}
                            onChange={(event) => void previewBackgroundCleanup(Number(event.target.value))}
                            onPointerUp={() => void saveBackgroundCleanup()}
                            onKeyUp={() => void saveBackgroundCleanup()}
                            className="h-3 w-full accent-[#5c0000]"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setCleanupEditorOpen(true)}
                          className="text-[8px] font-semibold text-[#5c0000] underline"
                        >
                          Enlarge
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachedArtwork(originalAttachedArtwork);
                            setCleanupStrength(0);
                            setCleanupDirty(false);
                            setCleanupEditorOpen(false);
                          }}
                          disabled={uploadingArtwork}
                          className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border border-[#5c0000] px-2 text-[8px] font-semibold text-[#5c0000] hover:bg-[#f5eaea] disabled:opacity-40"
                        >
                          Undo
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Remove attached artwork"
                  onClick={() => {
                    setAttachedArtwork(null);
                    setOriginalAttachedArtwork(null);
                    setCleanupStrength(0);
                    setCleanupDirty(false);
                    setCleanupEditorOpen(false);
                  }}
                  className="rounded-full p-1 text-[#8a8580] hover:bg-[#eee9e2]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            {artworkError ? (
              <p className="mb-2 px-1 text-[10px] text-[#8b1e1e]">{artworkError}</p>
            ) : null}
            <div className="flex items-center gap-2">
              <input
                ref={artworkInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={attachArtwork}
                className="hidden"
              />
              <button
                type="button"
                aria-label="Attach artwork"
                disabled={busy || uploadingArtwork}
                onClick={() => artworkInputRef.current?.click()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e3ded7] text-[#5c0000] hover:bg-[#faf8f5] disabled:opacity-40"
              >
                {uploadingArtwork ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
              </button>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Describe a design or attach artwork"
                className="h-10 min-w-0 flex-1 rounded-full border border-[#e3ded7] bg-white px-3.5 text-[13px] outline-none focus:border-[#1c1b1b]"
              />
              <button
                type="submit"
                disabled={busy || uploadingArtwork || cleanupDirty || (!input.trim() && !attachedArtwork)}
                aria-label="Send"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5c0000] text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}
      {cleanupEditorOpen && attachedArtwork && originalAttachedArtwork ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 sm:p-8">
          <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e3ded7] px-4 py-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] text-[#1c1b1b] uppercase">Background cleanup</p>
                <p className="text-[10px] text-[#8a8580]">Higher strength may remove gray artwork details.</p>
              </div>
              <button type="button" onClick={() => setCleanupEditorOpen(false)} className="rounded-full p-2 text-[#8a8580] hover:bg-[#f0ece6]" aria-label="Close cleanup preview">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
              style={{
                backgroundColor: '#fff',
                backgroundImage:
                  'linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)',
                backgroundSize: '24px 24px',
                backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
              }}
            >
              <img src={attachedArtwork.previewUrl} alt="Background cleanup preview" className="max-h-[65dvh] max-w-full object-contain" />
            </div>
            <div className="border-t border-[#e3ded7] bg-white p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#5c0000]"><span>Cleanup strength</span><span>{cleanupStrength}%</span></div>
              <input
                type="range"
                min="1"
                max="100"
                value={cleanupStrength}
                disabled={uploadingArtwork}
                onChange={(event) => void previewBackgroundCleanup(Number(event.target.value))}
                onPointerUp={() => void saveBackgroundCleanup()}
                onKeyUp={() => void saveBackgroundCleanup()}
                className="h-6 w-full accent-[#5c0000]"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => {
                  setAttachedArtwork(originalAttachedArtwork);
                  setCleanupStrength(0);
                  setCleanupDirty(false);
                  setCleanupEditorOpen(false);
                }} className="h-9 rounded-full border border-[#5c0000] px-4 text-xs font-semibold text-[#5c0000]">Undo</button>
                <button type="button" onClick={() => void saveBackgroundCleanup().then(() => {
                  setCleanupEditorOpen(false);
                })} disabled={uploadingArtwork} className="h-9 rounded-full bg-[#5c0000] px-5 text-xs font-semibold text-white disabled:opacity-40">Done</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
