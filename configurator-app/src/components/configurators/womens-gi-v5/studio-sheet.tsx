import { memo, useCallback, useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';

import {
  createDraftLogoObjectUrls,
  deleteGiDraftDocument,
  listSavedGiDesigns,
  type GiDraftDocument,
} from '../womens-gi/gi-draft-storage';
import {
  deleteGiCloudDesign,
  getGiCloudOwnerContext,
  listGiCloudDesigns,
} from '../womens-gi/gi-cloud-designs';
import { useGiState, type KimonoLogo } from '../womens-gi/gi-state';
import type { KimonoLogoSlot, PantLogoSlot } from '../womens-gi/gi-config';
import {
  APPLY_TARGETS,
  useUploadedLogos,
  type LogoApplyTarget,
  type UploadedLogoItem,
} from '../womens-gi/use-uploaded-logos';
import { currentGiProductConfig } from '../shared/gi-product-config';
import { lockerUrl } from '../shared/dspln-rail-links';
import { useDrawerDialog } from './use-drawer-dialog';

/**
 * The Studio Sheet — a collapsible bottom sheet (the app's native pattern:
 * assistant, size picker, order summary) holding the customer's designs and
 * uploads as browsable galleries. The gi stays visible ABOVE the sheet, so
 * restoring a design or placing an upload happens live in view — the left
 * burger drawer covered the model, which is exactly wrong for a visual
 * choice. The burger stays as the index; this is the gallery. The Locker
 * remains the full account dashboard ("See all" links out to it).
 */

export type StudioSheetTab = 'designs' | 'uploads';

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

export const GiV5StudioSheet = memo(
  ({
    tab,
    onTabChange,
    onClose,
  }: {
    /** null = closed */
    tab: StudioSheetTab | null;
    onTabChange: (tab: StudioSheetTab) => void;
    onClose: () => void;
  }) => {
    const open = tab !== null;
    const [tall, setTall] = useState(false);
    const [designs, setDesigns] = useState<GiDraftDocument[]>([]);
    const [designsLoading, setDesignsLoading] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [applyFor, setApplyFor] = useState<UploadedLogoItem | null>(null);

    const { hydrate, kimonoLogos, pantLogos, setKimonoLogo, setPantLogo } =
      useGiState();

    const panelRef = useDrawerDialog(open, onClose);

    // Rendered unconditionally (hooks before the `open` bail), so state
    // survives closing — reset the transient bits on close.
    useEffect(() => {
      if (open) return;
      setTall(false);
      setConfirmDeleteId(null);
      setApplyFor(null);
    }, [open]);

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
        [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      setDesignsLoading(false);
    }, []);

    useEffect(() => {
      if (!open) return;
      void refreshDesigns();
    }, [open, refreshDesigns]);

    const uploads = useUploadedLogos({
      savedDesigns: designs,
      currentKimonoLogos: kimonoLogos,
      currentPantLogos: pantLogos,
      defaultDesignName: PRODUCT_CONFIG.designNamePrefix,
    });

    const handleLoadDesign = useCallback(
      (design: GiDraftDocument) => {
        // The sheet stays open so the change is visible behind it — the
        // customer collapses when they're done browsing.
        hydrate(design.spec, createDraftLogoObjectUrls(design), 'front-far');
      },
      [hydrate],
    );

    const handleDeleteDesign = useCallback(
      async (id: string) => {
        if (confirmDeleteId !== id) {
          setConfirmDeleteId(id);
          return;
        }
        setConfirmDeleteId(null);
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
      },
      [setKimonoLogo, setPantLogo],
    );

    if (!open) return null;

    return (
      <div className="pointer-events-none absolute inset-0 z-[55]">
        {/* NO dim backdrop — the whole point is watching the gi react. A
            transparent tap-away strip above the sheet still closes it. */}
        <button
          type="button"
          aria-label="Close studio sheet"
          onClick={onClose}
          className="pointer-events-auto absolute inset-0 h-full w-full cursor-default bg-transparent"
        />

        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Your designs and uploads"
          tabIndex={-1}
          className={`pointer-events-auto absolute right-0 bottom-0 left-0 flex flex-col rounded-t-3xl border border-white/40 bg-white/90 shadow-[0_-12px_48px_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150 outline-none transition-[height] duration-300 ${
            tall ? 'h-[80dvh]' : 'h-[45dvh]'
          }`}
        >
          {/* Drag handle — tap toggles half/tall */}
          <button
            type="button"
            aria-label={tall ? 'Collapse sheet' : 'Expand sheet'}
            onClick={() => setTall((was) => !was)}
            className="flex h-6 w-full shrink-0 items-center justify-center"
          >
            <span className="h-1 w-10 rounded-full bg-black/20" />
          </button>

          {/* Tabs + close */}
          <div className="flex items-center gap-2 px-4 pb-2">
            <div className="flex rounded-lg border border-black/10 bg-black/5 p-0.5">
              {(
                [
                  ['designs', `Designs${designs.length ? ` · ${designs.length}` : ''}`],
                  ['uploads', `Uploads${uploads.length ? ` · ${uploads.length}` : ''}`],
                ] as Array<[StudioSheetTab, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={tab === id}
                  onClick={() => onTabChange(id)}
                  style={{ fontSize: '11px' }}
                  className={`flex h-7 items-center rounded-md px-3 font-medium whitespace-nowrap transition ${
                    tab === id
                      ? 'border border-black/10 bg-white text-black shadow-[0_1px_4px_rgba(0,0,0,0.12)]'
                      : 'text-black/50 hover:text-black'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <a
              href={`${lockerUrl()}?page=${tab}`}
              target="_top"
              style={{ fontSize: '9px' }}
              className="ml-auto font-semibold tracking-[0.12em] text-black/35 uppercase transition hover:text-black"
            >
              See all
            </a>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-black/50 transition hover:bg-black/5 hover:text-black"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {tab === 'designs' ? (
              designsLoading && !designs.length ? (
                <p style={{ fontSize: '11px' }} className="pt-2 text-black/40">
                  Loading…
                </p>
              ) : !designs.length ? (
                <p style={{ fontSize: '11px' }} className="pt-2 text-black/40">
                  Nothing saved yet — use Save &amp; Share in Your Studio to
                  keep this one.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {designs.map((design) => (
                    <div
                      key={design.id}
                      className="relative overflow-hidden rounded-xl border border-black/10 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadDesign(design)}
                        aria-label={`Load ${design.name}`}
                        className="block w-full text-left"
                      >
                        <span className="block aspect-square w-full bg-white">
                          {design.thumbnailUrl ? (
                            <img
                              src={design.thumbnailUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                        </span>
                        <span className="block px-2 py-1.5">
                          <span
                            style={{ fontSize: '10px' }}
                            className="block truncate font-medium text-black"
                          >
                            {design.name}
                          </span>
                          <span
                            style={{ fontSize: '8px' }}
                            className="block text-black/40"
                          >
                            {formatSavedTime(design.updatedAt)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={
                          confirmDeleteId === design.id
                            ? `Confirm delete ${design.name}`
                            : `Delete ${design.name}`
                        }
                        onClick={() => void handleDeleteDesign(design.id)}
                        onBlur={() => setConfirmDeleteId(null)}
                        className={`absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-md transition ${
                          confirmDeleteId === design.id
                            ? 'bg-red-50 text-red-800'
                            : 'bg-white/80 text-black/35 hover:text-black'
                        }`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : applyFor ? (
              <div className="pt-1">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-black/10 bg-white p-0.5">
                    <img
                      src={applyFor.url}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  </span>
                  <span
                    style={{ fontSize: '11px' }}
                    className="min-w-0 flex-1 truncate text-black/55"
                  >
                    Place {applyFor.filename} on…
                  </span>
                  <button
                    type="button"
                    aria-label="Cancel placement"
                    onClick={() => setApplyFor(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-black/40 transition hover:bg-black/5 hover:text-black"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {APPLY_TARGETS.map((target) => (
                    <button
                      key={target.value}
                      type="button"
                      onClick={() => handleApplyUpload(applyFor, target.value)}
                      style={{ fontSize: '11px' }}
                      className="rounded-lg border border-black/10 bg-white/80 px-2 py-2 text-black transition hover:bg-black hover:text-white"
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : !uploads.length ? (
              <p style={{ fontSize: '11px' }} className="pt-2 text-black/40">
                No artwork yet — upload a logo from any placement square.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {uploads.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setApplyFor(item)}
                    title={item.filename}
                    aria-label={`Place ${item.filename}`}
                    className="aspect-square overflow-hidden rounded-lg border border-black/10 bg-white p-1 transition hover:border-black/50"
                  >
                    <img
                      src={item.url}
                      alt=""
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
GiV5StudioSheet.displayName = 'GiV5StudioSheet';
