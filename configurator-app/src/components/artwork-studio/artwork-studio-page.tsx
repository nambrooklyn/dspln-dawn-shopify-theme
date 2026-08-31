import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { CheckCircle2, ImagePlus, LoaderCircle, Upload } from 'lucide-react';

import { uploadArtworkImage } from '../configurators/shared/preview-upload';
import { ArtworkAiPrompt, requestArtworkRevision } from './artwork-assistant';
import {
  ArtworkEditor,
  MAX_ARTWORK_BYTES,
  readArtworkFile,
  removeEdgeConnectedLightBackground,
  type AttachedArtwork,
} from './artwork-editor';

/**
 * Artwork Studio — create and clean artwork without opening a configurator.
 *
 * Uses the same deterministic engine as the configurator Design Assistant.
 * Persistence is the Locker's job: this component calls the `onSave` prop and
 * never talks to the Locker API directly.
 */

export interface ArtworkSaveMeta {
  filename: string;
  width: number;
  height: number;
  ownerKey: string;
  /** The untouched upload, kept so the Locker can preserve the original. */
  originalDataUrl: string;
  /** True when the saved revision came out of a generative AI edit. */
  aiEdited: boolean;
}

export interface SavedArtwork {
  id: string;
  url: string;
}

export interface ArtworkStudioPageProps {
  /** Locker customer key. Empty/undefined renders the signed-out state. */
  ownerKey: string;
  /** Persists the artwork. Return null to signal a handled failure. */
  onSave: (
    blob: Blob,
    meta: ArtworkSaveMeta,
  ) => Promise<SavedArtwork | null>;
  /** Fired after a successful save. */
  onSaved?: (saved: SavedArtwork) => void;
  /** "Use on a product" — called with the saved artwork when provided. */
  onUseOnProduct?: (saved: SavedArtwork) => void;
  /** Href builder for "Use on a product" when no callback is given. */
  buildUseOnProductHref?: (saved: SavedArtwork) => string;
  /** Href for "View in Uploads". */
  uploadsHref?: string;
}

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

export function ArtworkStudioPage({
  ownerKey,
  onSave,
  onSaved,
  onUseOnProduct,
  buildUseOnProductHref,
  uploadsHref = '/pages/the-locker',
}: ArtworkStudioPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** The untouched upload — never overwritten, so any error can fall back. */
  const [original, setOriginal] = useState<AttachedArtwork | null>(null);
  /** Last successful revision, restored whenever an operation fails. */
  const [lastGood, setLastGood] = useState<AttachedArtwork | null>(null);
  const [current, setCurrent] = useState<AttachedArtwork | null>(null);
  const [cleanupStrength, setCleanupStrength] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiEdited, setAiEdited] = useState(false);
  const [saved, setSaved] = useState<SavedArtwork | null>(null);

  // Keep the page behind the editor from scrolling while it is open.
  useEffect(() => {
    if (!editorOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [editorOpen]);

  const chooseFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setSaved(null);
    if (!ownerKey) {
      setError('Your Locker session expired. Please sign in again to keep artwork.');
      return;
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Please choose a PNG or JPEG image.');
      return;
    }
    if (file.size > MAX_ARTWORK_BYTES) {
      setError('Artwork must be under 6 MB.');
      return;
    }
    setBusy(true);
    try {
      const { dataUrl, dimensions } = await readArtworkFile(file);
      const artwork: AttachedArtwork = {
        id: crypto.randomUUID(),
        url: '',
        previewUrl: dataUrl,
        filename: file.name,
        width: dimensions.width,
        height: dimensions.height,
      };
      setOriginal(artwork);
      setLastGood(artwork);
      setCurrent(artwork);
      setCleanupStrength(1);
      setAiEdited(false);
      setEditorOpen(true);
    } catch {
      setError('That image could not be opened. Please try another PNG or JPEG.');
    } finally {
      setBusy(false);
    }
  }, [ownerKey]);

  const runBackgroundRemoval = useCallback(async (strength: number) => {
    if (!original) return;
    setError('');
    setBusy(true);
    try {
      const dataUrl = await removeEdgeConnectedLightBackground(
        original.previewUrl,
        strength,
      );
      const next: AttachedArtwork = {
        ...original,
        id: `preview-${crypto.randomUUID()}`,
        previewUrl: dataUrl,
        filename: original.filename.replace(/\.[^.]+$/, '') + '-transparent.png',
      };
      setCurrent(next);
      setLastGood(next);
      setCleanupStrength(strength);
    } catch {
      setCurrent(lastGood ?? original);
      setError('The background could not be removed. Your image is unchanged.');
    } finally {
      setBusy(false);
    }
  }, [lastGood, original]);

  const runAiEdit = useCallback(async (prompt: string) => {
    const source = current;
    if (!source) return;
    setError('');
    setAiBusy(true);
    try {
      // The agent edits a hosted image, so host the current revision first.
      const hostedUrl = source.previewUrl.startsWith('data:')
        ? await uploadArtworkImage(source.previewUrl)
        : source.previewUrl;
      if (!hostedUrl) throw new Error('That artwork could not be uploaded for the AI edit.');
      const revision = await requestArtworkRevision({
        operation: 'edit',
        prompt,
        imageUrl: hostedUrl,
        filename: source.filename,
      });
      // A new revision — the untouched original stays exactly as uploaded.
      setCurrent(revision);
      setLastGood(revision);
      setAiEdited(true);
      setSaved(null);
    } catch (aiError) {
      setCurrent(lastGood ?? original);
      throw aiError instanceof Error
        ? aiError
        : new Error('That AI edit did not finish. Your artwork is unchanged.');
    } finally {
      setAiBusy(false);
    }
  }, [current, lastGood, original]);

  const save = useCallback(async () => {
    if (!current || !original) return;
    if (!ownerKey) {
      setError('Your Locker session expired. Please sign in again to save this artwork.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const blob = await dataUrlToBlob(current.previewUrl);
      const result = await onSave(blob, {
        filename: current.filename,
        width: current.width,
        height: current.height,
        ownerKey,
        originalDataUrl: original.previewUrl,
        aiEdited,
      });
      if (!result) {
        setError('This artwork could not be saved. Your edits are still here — try again.');
        return;
      }
      setSaved(result);
      setEditorOpen(false);
      onSaved?.(result);
    } catch {
      setError('This artwork could not be saved. Your edits are still here — try again.');
    } finally {
      setBusy(false);
    }
  }, [aiEdited, current, original, onSave, onSaved, ownerKey]);

  const resetToOriginal = useCallback(() => {
    if (!original) return;
    setCurrent(original);
    setLastGood(original);
    setCleanupStrength(1);
    setAiEdited(false);
    setError('');
  }, [original]);

  const useOnProductHref = saved && buildUseOnProductHref ? buildUseOnProductHref(saved) : null;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1c1b1b] sm:text-3xl">
          Artwork Studio
        </h1>
        <p className="mt-1 text-sm text-[#6b6560]">
          Upload a logo or design, remove its background, and clean it up — no
          product required.
        </p>
      </header>

      {!ownerKey ? (
        <p className="mb-4 rounded-xl border border-[#e3c9c9] bg-[#fdf5f5] px-4 py-3 text-sm font-medium text-[#8b1e1e]">
          Your Locker session has expired. Sign in again to save artwork.
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl border border-[#e3c9c9] bg-[#fdf5f5] px-4 py-3 text-sm font-medium text-[#8b1e1e]">
          {error}
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={(event) => void chooseFile(event)}
        className="hidden"
      />

      {!current ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#d7d0c8] bg-[#faf8f5] px-6 py-16 text-center">
          <ImagePlus className="mb-3 h-8 w-8 text-[#8a8580]" aria-hidden="true" />
          <p className="mb-4 max-w-sm text-sm text-[#6b6560]">
            PNG or JPEG, up to 6 MB.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#5c0000] px-6 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload artwork
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#e3ded7] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <img
              src={current.previewUrl}
              alt={current.filename}
              className="h-16 w-16 rounded-lg border border-[#e3ded7] object-contain"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#1c1b1b]">{current.filename}</p>
              <p className="text-xs text-[#8a8580]">{current.width} × {current.height} px</p>
            </div>
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="h-10 rounded-full bg-[#5c0000] px-5 text-sm font-semibold text-white"
            >
              {saved ? 'Continue editing' : 'Open editor'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 rounded-full border border-[#d7d0c8] px-5 text-sm font-semibold text-[#1c1b1b]"
            >
              Replace
            </button>
          </div>

          {saved ? (
            <div className="mt-4 rounded-xl border border-[#cfe3cf] bg-[#f5faf5] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#1f5c1f]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Artwork saved to your Locker.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {onUseOnProduct ? (
                  <button
                    type="button"
                    onClick={() => onUseOnProduct(saved)}
                    className="h-10 rounded-full bg-[#5c0000] px-5 text-sm font-semibold text-white"
                  >
                    Use on a product
                  </button>
                ) : useOnProductHref ? (
                  <a
                    href={useOnProductHref}
                    className="inline-flex h-10 items-center rounded-full bg-[#5c0000] px-5 text-sm font-semibold text-white"
                  >
                    Use on a product
                  </a>
                ) : null}
                <a
                  href={uploadsHref}
                  className="inline-flex h-10 items-center rounded-full border border-[#d7d0c8] px-5 text-sm font-semibold text-[#1c1b1b]"
                >
                  View in Uploads
                </a>
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  className="h-10 rounded-full border border-[#d7d0c8] px-5 text-sm font-semibold text-[#1c1b1b]"
                >
                  Continue editing
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {editorOpen && current && original ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center overscroll-none bg-black/70 p-2 sm:p-4 md:p-8">
          <div className="flex h-[92dvh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-[#dedede] bg-white shadow-2xl">
            <ArtworkEditor
              imageUrl={current.previewUrl}
              originalUrl={original.previewUrl}
              onClose={() => setEditorOpen(false)}
              onRemoveBackground={() => {
                void runBackgroundRemoval(Math.max(1, cleanupStrength));
              }}
              onDimensionsChange={(width, height) => {
                setCurrent((value) => (value ? { ...value, width, height } : value));
              }}
              onChange={(dataUrl) => {
                setCurrent((value) => {
                  if (!value) return value;
                  const next = { ...value, previewUrl: dataUrl };
                  setLastGood(next);
                  return next;
                });
                setSaved(null);
              }}
            />
            <div className="max-h-[45dvh] shrink-0 overflow-y-auto border-t border-[#e3ded7] bg-white p-4">
              {error ? (
                <p className="mb-3 rounded-lg border border-[#e3c9c9] bg-[#fdf5f5] px-3 py-2 text-xs font-semibold text-[#8b1e1e]">
                  {error}
                </p>
              ) : null}
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#5c0000]">
                <span>Cleanup strength</span>
                <span>{cleanupStrength}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={cleanupStrength}
                disabled={busy}
                onChange={(event) => void runBackgroundRemoval(Number(event.target.value))}
                className="h-6 w-full accent-[#5c0000]"
              />
              <div className="mt-3">
                <ArtworkAiPrompt
                  busy={aiBusy}
                  disabled={busy}
                  onSubmit={runAiEdit}
                />
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={resetToOriginal}
                  className="h-9 rounded-full border border-[#5c0000] px-4 text-xs font-semibold text-[#5c0000]"
                >
                  Reset original
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy || aiBusy || !ownerKey}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#5c0000] px-5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {busy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
                  Save to Locker
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ArtworkStudioPage;
