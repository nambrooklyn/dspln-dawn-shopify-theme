import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Images,
  Layers,
  RotateCcw,
  Share2,
  Trash2,
  User,
  X,
} from 'lucide-react';

import {
  AUTO_GI_DRAFT_ID,
  createDraftLogoObjectUrls,
  deleteGiDraftDocument,
  listSavedGiDesigns,
  readGiDraftDocument,
  type GiDraftDocument,
} from '../kids-gi/gi-draft-storage';
import {
  deleteGiCloudDesign,
  getGiCloudOwnerContext,
  listGiCloudDesigns,
  saveGiCloudDesignRecord,
} from '../kids-gi/gi-cloud-designs';
import { useGiState, type KimonoLogo } from '../kids-gi/gi-state';
import { storefrontOrigin } from '../shared/storefront-links';
import { lockerUrl } from '../shared/dspln-rail-links';
import type { KimonoLogoSlot, PantLogoSlot } from '../kids-gi/gi-config';
import {
  APPLY_TARGETS,
  useUploadedLogos,
  type LogoApplyTarget,
  type UploadedLogoItem,
} from '../kids-gi/use-uploaded-logos';
import { currentGiProductConfig } from '../shared/gi-product-config';
import { useDrawerDialog } from './use-drawer-dialog';

/**
 * The burger drawer — the customer's PERSONAL hub (Nam's call: the burger is
 * "your stuff", not site navigation; the wordmark is the way back to the
 * store).
 *
 * Designs and uploads now expand INLINE rather than linking out: leaving the
 * configurator mid-design is exactly what a personal hub should not require.
 * Both sections still offer the full account page as a footer link. Data
 * comes from the same stores the v1 rail reads — local drafts, cloud designs
 * for signed-in customers, and every image embedded in them.
 */



const PRODUCT_CONFIG = currentGiProductConfig();

function formatSavedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

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

function SectionHeader({
  icon,
  label,
  count,
  open,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  count: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={rowClass}
      style={rowLabelStyle}
    >
      <span className="text-black/50">{icon}</span>
      <span className="font-medium">{label}</span>
      {count ? (
        <span
          style={{ fontSize: '9px' }}
          className="rounded-full bg-black/10 px-1.5 py-0.5 font-semibold text-black/55"
        >
          {count}
        </span>
      ) : null}
      <ChevronDown
        className={`ml-auto h-3.5 w-3.5 text-black/30 transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '10px' }} className="px-6 pb-2 text-black/35">
      {children}
    </p>
  );
}

function SectionFooterLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_top"
      style={{ fontSize: '9px' }}
      className="flex items-center gap-1 px-6 pb-2 font-semibold tracking-[0.12em] text-black/35 uppercase transition hover:text-black"
    >
      {label}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}

export const GiV5BurgerDrawer = memo(
  ({
    open,
    onClose,
    onOpenStudio,
  }: {
    open: boolean;
    onClose: () => void;
    /** Open the bottom Studio Sheet on the given tab (closes this drawer). */
    onOpenStudio: (tab: 'designs' | 'uploads') => void;
  }) => {
    const [shareState, setShareState] = useState<
      | { phase: 'idle' }
      | { phase: 'saving' }
      | { phase: 'done'; url: string; copied: boolean }
      | { phase: 'error'; message: string }
    >({ phase: 'idle' });
    const [confirmReset, setConfirmReset] = useState(false);
    const [designsOpen, setDesignsOpen] = useState(false);
    const [uploadsOpen, setUploadsOpen] = useState(false);
    const [designs, setDesigns] = useState<GiDraftDocument[]>([]);
    const [designsLoading, setDesignsLoading] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [applyFor, setApplyFor] = useState<UploadedLogoItem | null>(null);

    const { hydrate, kimonoLogos, pantLogos, setKimonoLogo, setPantLogo } =
      useGiState();

    const panelRef = useDrawerDialog(open, onClose);

    // The shell renders this drawer unconditionally and it bails with
    // `return null` AFTER its hooks, so it never unmounts and state
    // persists. "Start a New Design" left half-armed would then wipe the
    // draft on a single tap the next time the drawer opened (#2).
    useEffect(() => {
      if (open) return;
      setConfirmReset(false);
      setShareState({ phase: 'idle' });
      setConfirmDeleteId(null);
      setApplyFor(null);
    }, [open]);

    // Designs are read fresh each time the drawer opens — cheap, and it
    // avoids showing a list that went stale while the customer worked.
    const refreshDesigns = useCallback(async () => {
      setDesignsLoading(true);
      const [local, cloud] = await Promise.all([
        listSavedGiDesigns().catch(() => [] as GiDraftDocument[]),
        listGiCloudDesigns(getGiCloudOwnerContext()).catch(
          () => [] as GiDraftDocument[],
        ),
      ]);
      // Cloud wins on id collisions: it is the copy the customer can share.
      const byId = new Map<string, GiDraftDocument>();
      [...cloud, ...local].forEach((design) => {
        if (!byId.has(design.id)) byId.set(design.id, design);
      });
      setDesigns(
        [...byId.values()].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        ),
      );
      setDesignsLoading(false);
    }, []);

    useEffect(() => {
      if (!open) return;
      let active = true;
      void (async () => {
        await refreshDesigns();
        if (!active) setDesignsLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [open, refreshDesigns]);

    const uploads = useUploadedLogos({
      savedDesigns: designs,
      currentKimonoLogos: kimonoLogos,
      currentPantLogos: pantLogos,
      defaultDesignName: PRODUCT_CONFIG.designNamePrefix,
    });

    const handleLoadDesign = useCallback(
      (design: GiDraftDocument) => {
        // 'front-far' is v5's resting framing — the default 'front' would
        // stomp the shell's zoomed-out view on restore.
        hydrate(design.spec, createDraftLogoObjectUrls(design), 'front-far');
        onClose();
      },
      [hydrate, onClose],
    );

    const handleDeleteDesign = useCallback(
      async (id: string) => {
        if (confirmDeleteId !== id) {
          setConfirmDeleteId(id);
          return;
        }
        setConfirmDeleteId(null);
        // Same pair the v1 rail deletes — local draft and cloud record.
        await Promise.allSettled([
          deleteGiDraftDocument(id),
          deleteGiCloudDesign(id, getGiCloudOwnerContext()),
        ]);
        await refreshDesigns();
      },
      [confirmDeleteId, refreshDesigns],
    );

    const handleApplyUpload = useCallback(
      (item: UploadedLogoItem, target: LogoApplyTarget) => {
        const logo: KimonoLogo = {
          imageUrl: item.url,
          filename: item.filename,
          imageWidth: item.imageWidth,
          imageHeight: item.imageHeight,
        };
        const [group, slot] = target.split(':');
        if (group === 'kimono') {
          setKimonoLogo(slot as KimonoLogoSlot, logo);
        } else {
          setPantLogo(slot as PantLogoSlot, logo);
        }
        setApplyFor(null);
        onClose();
      },
      [onClose, setKimonoLogo, setPantLogo],
    );

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
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Your Studio"
          tabIndex={-1}
          className="absolute top-0 bottom-0 left-0 flex w-72 max-w-[85vw] flex-col rounded-r-3xl border border-white/40 bg-white/85 shadow-[12px_0_48px_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150 outline-none"
        >
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
            {/* My Designs / My Uploads open the bottom Studio Sheet — a
                gallery the gi stays visible above. The Locker remains the
                full account dashboard. */}
            <button
              type="button"
              onClick={() => onOpenStudio('designs')}
              className={rowClass}
              style={rowLabelStyle}
            >
              <span className="text-black/50">
                <Layers className="h-4 w-4" />
              </span>
              <span className="font-medium">My Designs</span>
              {designs.length ? (
                <span
                  style={{ fontSize: '9px' }}
                  className="rounded-full bg-black/10 px-1.5 py-0.5 font-semibold text-black/55"
                >
                  {designs.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => onOpenStudio('uploads')}
              className={rowClass}
              style={rowLabelStyle}
            >
              <span className="text-black/50">
                <Images className="h-4 w-4" />
              </span>
              <span className="font-medium">My Uploads</span>
              {uploads.length ? (
                <span
                  style={{ fontSize: '9px' }}
                  className="rounded-full bg-black/10 px-1.5 py-0.5 font-semibold text-black/55"
                >
                  {uploads.length}
                </span>
              ) : null}
            </button>

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
