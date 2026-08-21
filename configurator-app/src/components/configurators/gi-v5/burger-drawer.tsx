import { memo, useCallback, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Images,
  Layers,
  RotateCcw,
  Share2,
  User,
  X,
} from 'lucide-react';

import {
  AUTO_GI_DRAFT_ID,
  deleteGiDraftDocument,
  readGiDraftDocument,
} from '../gi/gi-draft-storage';
import {
  getGiCloudOwnerContext,
  saveGiCloudDesignRecord,
} from '../gi/gi-cloud-designs';
import { storefrontOrigin } from '../shared/storefront-links';
import { lockerUrl } from '../shared/dspln-rail-links';

/**
 * The burger drawer — the customer's PERSONAL hub (Nam's call: the burger is
 * "your stuff", not site navigation; the wordmark is the way back to the
 * store). Phase 1: working links to the existing account pages, cloud
 * Save & Share, and start-over. Inline design/upload lists come later.
 */

const rowClass =
  'pointer-events-auto flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-black transition hover:bg-black/5 active:bg-black/10';
const rowLabelStyle = { fontSize: '12px' } as const;

function LinkRow({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  return (
    <a href={href} target="_top" className={rowClass} style={rowLabelStyle}>
      <span className="text-black/50">{icon}</span>
      <span className="font-medium">{label}</span>
      <ExternalLink className="ml-auto h-3 w-3 text-black/25" />
    </a>
  );
}

export const GiV5BurgerDrawer = memo(
  ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const [shareState, setShareState] = useState<
      | { phase: 'idle' }
      | { phase: 'saving' }
      | { phase: 'done'; url: string; copied: boolean }
      | { phase: 'error'; message: string }
    >({ phase: 'idle' });
    const [confirmReset, setConfirmReset] = useState(false);

    const owner = useMemo(
      () => (open ? getGiCloudOwnerContext() : null),
      [open],
    );
    const signedIn = Boolean(owner?.shopifyCustomerId);
    const origin = useMemo(storefrontOrigin, []);
    const locker = useMemo(lockerUrl, []);

    const handleShare = useCallback(async () => {
      setShareState({ phase: 'saving' });
      try {
        const draft = await readGiDraftDocument(AUTO_GI_DRAFT_ID);
        if (!draft) {
          setShareState({
            phase: 'error',
            message: 'Nothing to save yet — customize something first.',
          });
          return;
        }
        const result = await saveGiCloudDesignRecord(
          draft,
          getGiCloudOwnerContext(),
        );
        const url = result?.designUrl ?? result?.netlifyDesignUrl;
        if (!url) {
          setShareState({
            phase: 'error',
            message: 'Saving is unavailable right now — please try again.',
          });
          return;
        }
        setShareState({ phase: 'done', url, copied: false });
      } catch {
        setShareState({
          phase: 'error',
          message: 'Saving is unavailable right now — please try again.',
        });
      }
    }, []);

    const handleCopy = useCallback(async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        setShareState({ phase: 'done', url, copied: true });
      } catch {
        // Selection fallback: leave the link visible for manual copy.
      }
    }, []);

    const handleReset = useCallback(async () => {
      if (!confirmReset) {
        setConfirmReset(true);
        return;
      }
      try {
        await deleteGiDraftDocument(AUTO_GI_DRAFT_ID);
      } finally {
        // Reload with a clean draft — the page comes back as a fresh design.
        const url = new URL(window.location.href);
        url.searchParams.delete('design');
        window.location.href = url.toString();
      }
    }, [confirmReset]);

    if (!open) return null;

    return (
      <div className="absolute inset-0 z-[60]">
        {/* Backdrop */}
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="absolute inset-0 h-full w-full cursor-default bg-black/25"
        />

        {/* Left sheet */}
        <div className="absolute top-0 bottom-0 left-0 flex w-72 max-w-[85vw] flex-col rounded-r-3xl border border-white/40 bg-white/85 shadow-[12px_0_48px_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <span className="text-[12px] font-bold tracking-[0.16em] text-black uppercase">
              Your Studio
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-black/50 transition hover:bg-black/5 hover:text-black"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Autosave reassurance */}
          <p
            style={{ fontSize: '10px' }}
            className="px-4 pb-2 text-black/40"
          >
            Your design autosaves on this device as you work.
          </p>

          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
            <LinkRow
              icon={<Layers className="h-4 w-4" />}
              label="My Designs"
              href={`${locker}?page=designs`}
            />
            <LinkRow
              icon={<Images className="h-4 w-4" />}
              label="My Uploads"
              href={`${locker}?page=uploads`}
            />

            {/* Save & share — the drawer's one action */}
            <button
              type="button"
              onClick={handleShare}
              disabled={shareState.phase === 'saving'}
              className={rowClass}
              style={rowLabelStyle}
            >
              <span className="text-black/50">
                <Share2 className="h-4 w-4" />
              </span>
              <span className="font-medium">
                {shareState.phase === 'saving'
                  ? 'Saving…'
                  : 'Save & Share This Design'}
              </span>
            </button>
            {shareState.phase === 'done' ? (
              <div className="mx-3 mb-1 flex items-center gap-2 rounded-lg border border-black/10 bg-white/80 px-2.5 py-2">
                <span
                  style={{ fontSize: '10px' }}
                  className="min-w-0 flex-1 truncate text-black/60"
                >
                  {shareState.url}
                </span>
                <button
                  type="button"
                  aria-label="Copy link"
                  onClick={() => handleCopy(shareState.url)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-black/50 transition hover:bg-black/5 hover:text-black"
                >
                  {shareState.copied ? (
                    <Check className="h-3.5 w-3.5 text-green-700" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ) : null}
            {shareState.phase === 'error' ? (
              <p
                style={{ fontSize: '10px' }}
                className="mx-3 mb-1 text-red-800"
              >
                {shareState.message}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleReset}
              className={rowClass}
              style={rowLabelStyle}
            >
              <span className="text-black/50">
                <RotateCcw className="h-4 w-4" />
              </span>
              <span
                className={`font-medium ${confirmReset ? 'text-red-800' : ''}`}
              >
                {confirmReset
                  ? 'Tap again to confirm — clears this design'
                  : 'Start a New Design'}
              </span>
            </button>

            <LinkRow
              icon={<User className="h-4 w-4" />}
              label={
                signedIn
                  ? (owner?.customerEmail ?? 'My Account')
                  : 'Sign In / Create Account'
              }
              href={`${origin}/account`}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-black/10 px-4 py-3">
            <a
              href={`${origin}/`}
              target="_top"
              style={{ fontSize: '10px' }}
              className="font-semibold tracking-[0.12em] text-black/50 uppercase transition hover:text-black"
            >
              Shop DSPLN →
            </a>
            <a
              href={`${origin}/pages/sizing`}
              target="_top"
              style={{ fontSize: '10px' }}
              className="tracking-[0.12em] text-black/40 uppercase transition hover:text-black"
            >
              Sizing Guide
            </a>
          </div>
        </div>
      </div>
    );
  },
);
GiV5BurgerDrawer.displayName = 'GiV5BurgerDrawer';
