import { useState, type FormEvent } from 'react';
import { LoaderCircle, Send, WandSparkles } from 'lucide-react';

import type { AttachedArtwork } from './artwork-editor';

/**
 * Generative artwork edits.
 *
 * This is the ONLY path in the artwork stack that reaches an image model.
 * Background removal, crop, brushes, text, compositing and undo/redo are all
 * deterministic canvas work in ./artwork-editor and must never route here.
 */

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

export const requestArtworkRevision = async (payload: {
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

/**
 * True when the customer is only asking for a background removal. Those go to
 * the deterministic Remove background control instead of the image model.
 */
export const isBackgroundRemovalRequest = (prompt: string) => {
  const value = prompt.trim().toLowerCase();
  if (!value) return false;
  if (!/\bbackground\b|\bbackround\b|\bbg\b/.test(value)) return false;
  return /\b(remove|removing|delete|erase|strip|take\s+out|get\s+rid\s+of|cut\s+out|make\s+(it\s+)?transparent|transparent)\b/.test(
    value,
  );
};

/**
 * Prompt box for deliberate generative edits. The customer must type and
 * submit — nothing here fires automatically.
 */
export function ArtworkAiPrompt({
  disabled = false,
  busy = false,
  onSubmit,
}: {
  disabled?: boolean;
  busy?: boolean;
  /** Runs the generative edit. Resolve/throw so this box can show the result. */
  onSubmit: (prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || busy || disabled) return;
    setError('');
    if (isBackgroundRemovalRequest(value)) {
      setNotice(
        'Use the Remove background control above — it removes the background exactly, without an AI redraw.',
      );
      return;
    }
    setNotice('');
    try {
      await onSubmit(value);
      setPrompt('');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'That AI edit did not finish. Your original artwork is unchanged.',
      );
    }
  };

  return (
    <div className="rounded-xl border border-[#e3ded7] bg-[#faf8f5] p-2">
      <form className="flex items-center gap-2" onSubmit={(event) => void submit(event)}>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5c0000] text-white" aria-hidden="true">
          <WandSparkles className="h-4 w-4" />
        </span>
        <input
          id="artwork-editor-ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe a creative AI edit (optional)"
          className="h-9 min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"
        />
        <button
          type="submit"
          disabled={disabled || busy || !prompt.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#5c0000] px-4 text-[10px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Ask AI
        </button>
      </form>
      <p className="mt-2 px-1 text-[10px] leading-4 text-[#8a8580]">
        AI edits redraw the image and can change your artwork. Your untouched
        original is kept, and every AI edit is saved as a new revision.
      </p>
      {notice ? <p className="mt-1 px-1 text-[10px] font-semibold text-[#5c0000]">{notice}</p> : null}
      {error ? <p className="mt-1 px-1 text-[10px] font-semibold text-[#8b1e1e]">{error}</p> : null}
    </div>
  );
}
