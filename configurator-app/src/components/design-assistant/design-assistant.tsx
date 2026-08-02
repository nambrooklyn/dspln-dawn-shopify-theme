import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { ImagePlus, LoaderCircle, MessageCircleHeart, Send, X } from 'lucide-react';

import {
  BELT_COLOR_SWATCHES,
  GI_COLOR_SWATCHES,
  GI_PART_PRICES,
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
 * ?assistant=1. Production customers see nothing until the flag is opened up.
 */

const INVITE_DELAY_MS = 4500;
const INVITE_DISMISSED_KEY = 'dspln:design-assistant:invite-dismissed';
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

interface AttachedArtwork {
  id: string;
  url: string;
  previewUrl: string;
  filename: string;
  width: number;
  height: number;
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

export function shouldShowDesignAssistant(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('assistant');
    if (flag === '1') return true;
    if (flag === '0') return false;
    return window.location.hostname.startsWith('dev--');
  } catch {
    return false;
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

export function DesignAssistant() {
  const state = useGiState();
  const [open, setOpen] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingArtwork, setUploadingArtwork] = useState(false);
  const [artworkError, setArtworkError] = useState('');
  const [attachedArtwork, setAttachedArtwork] = useState<AttachedArtwork | null>(null);
  const conversationRef = useRef<ApiMessage[]>([]);
  const artworkRef = useRef(new Map<string, AttachedArtwork>());
  const artworkInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(INVITE_DISMISSED_KEY) === '1') return;
    } catch {
      /* private mode */
    }
    const timer = window.setTimeout(() => setInviteVisible(true), INVITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [bubbles, busy]);

  const dismissInvite = useCallback(() => {
    setInviteVisible(false);
    try {
      window.sessionStorage.setItem(INVITE_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const openChat = useCallback(() => {
    dismissInvite();
    setOpen(true);
    setBubbles((prev) =>
      prev.length > 0
        ? prev
        : [
            {
              role: 'assistant',
              text: "Hey! I'm the DSPLN design assistant. Tell me what you're going for — team colors, a competition gi, something bold — and I'll set it up right here on the 3D model.",
            },
          ],
    );
  }, [dismissInvite]);

  const attachArtwork = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

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
    } catch {
      setArtworkError('I could not upload that image. Please try another file.');
    } finally {
      setUploadingArtwork(false);
    }
  }, []);

  // ---- tool execution against live configurator state ----

  const runTool = useCallback(
    (name: string, toolInput: Record<string, unknown>): string => {
      const s = stateRef.current;
      switch (name) {
        case 'get_design': {
          const included = (['jacket', 'pants', 'belt'] as GiPart[]).filter(
            (part) => s.partVisibility[part],
          );
          const logoCount = Object.values(s.kimonoLogos).filter(Boolean).length;
          return JSON.stringify({
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
          });
        }
        case 'set_panel_color': {
          const target = String(toolInput.target ?? '');
          const colorName = String(toolInput.color ?? '');
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
          if (!['jacket', 'pants', 'belt'].includes(part)) {
            return JSON.stringify({ ok: false, error: 'Unknown part' });
          }
          s.setPartVisible(part, Boolean(toolInput.included));
          return JSON.stringify({ ok: true });
        }
        case 'set_sizes': {
          if (typeof toolInput.kimono === 'string') s.setKimonoSize(toolInput.kimono);
          if (typeof toolInput.pant === 'string') s.setPantSize(toolInput.pant);
          if (typeof toolInput.belt === 'string') s.setBeltSize(toolInput.belt);
          return JSON.stringify({ ok: true });
        }
        case 'set_belt_text': {
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
        default:
          return JSON.stringify({ ok: false, error: `Unknown tool ${name}` });
      }
    },
    [],
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
            body: JSON.stringify({ messages: conversationRef.current }),
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

          conversationRef.current = [
            ...conversationRef.current,
            {
              role: 'user',
              content: toolUses.map((tool) => ({
                type: 'tool_result',
                tool_use_id: tool.id,
                content: runTool(tool.name, tool.input),
              })),
            },
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
    [attachedArtwork, busy, input, runTool, uploadingArtwork],
  );

  // ---- UI ----

  return (
    <>
      {inviteVisible && !open ? (
        <div className="fixed bottom-20 left-4 z-[70] max-w-[15.5rem] rounded-2xl border border-[#e3ded7] bg-white p-3.5 shadow-xl">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismissInvite}
            className="absolute top-1.5 right-1.5 rounded-full p-1 text-[#8a8580] hover:bg-[#f4f1ec]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="text-[13px] leading-snug text-[#1c1b1b]">
            👋 Want a hand designing your gi? Tell me your team colors or the
            look you want — I&apos;ll build it for you right here.
          </p>
          <button
            type="button"
            onClick={openChat}
            className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#5c0000] px-3.5 text-[11px] font-semibold tracking-[0.1em] text-white uppercase hover:bg-[#4a0000]"
          >
            <MessageCircleHeart className="h-3.5 w-3.5" />
            Design with me
          </button>
        </div>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={openChat}
          aria-label="Open design assistant"
          className="fixed bottom-4 left-4 z-[70] inline-flex h-11 items-center gap-2 rounded-full bg-[#1c1b1b] px-4 text-[11px] font-semibold tracking-[0.12em] text-white uppercase shadow-lg hover:bg-black"
        >
          <MessageCircleHeart className="h-4 w-4" />
          Design Assistant
        </button>
      ) : (
        <div className="fixed bottom-4 left-4 z-[70] flex h-[min(30rem,calc(100dvh-6rem))] w-[min(21rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#e3ded7] bg-white shadow-2xl">
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
                <img
                  src={attachedArtwork.previewUrl}
                  alt={attachedArtwork.filename}
                  className="h-12 w-12 rounded-lg bg-white object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-[#1c1b1b]">
                    {attachedArtwork.filename}
                  </p>
                  <p className="text-[10px] text-[#8a8580]">
                    {attachedArtwork.width} × {attachedArtwork.height}px
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Remove attached artwork"
                  onClick={() => setAttachedArtwork(null)}
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
                disabled={busy || uploadingArtwork || (!input.trim() && !attachedArtwork)}
                aria-label="Send"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5c0000] text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
