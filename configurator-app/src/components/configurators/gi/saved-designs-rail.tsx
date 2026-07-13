import { memo, useEffect, useState } from 'react';
import {
  Clock3,
  ImageIcon,
  Link2,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { currentGiProductConfig } from '../shared/gi-product-config';

import type { GiDraftDocument } from './gi-draft-storage';
import {
  KIMONO_LOGO_SLOT_LABEL,
  KIMONO_LOGO_SLOTS,
  PANT_LOGO_SLOT_LABEL,
  PANT_LOGO_SLOTS,
  type KimonoLogoSlot,
  type PantLogoSlot,
} from './gi-config';
import type { KimonoLogo } from './gi-state';

export type DraftStatus = 'loading' | 'saving' | 'saved' | 'error';

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

interface UploadedLogoItem {
  key: string;
  url: string;
  filename: string;
  slot: string;
  designName: string;
  updatedAt: string;
  imageWidth: number;
  imageHeight: number;
}

type LogoApplyTarget =
  | `kimono:${KimonoLogoSlot}`
  | `pant:${PantLogoSlot}`;

const APPLY_TARGETS: Array<{ value: LogoApplyTarget; label: string }> = [
  ...KIMONO_LOGO_SLOTS.map((slot) => ({
    value: `kimono:${slot}` as const,
    label: KIMONO_LOGO_SLOT_LABEL[slot].replace(/^Logo on /, ''),
  })),
  ...PANT_LOGO_SLOTS.map((slot) => ({
    value: `pant:${slot}` as const,
    label: PANT_LOGO_SLOT_LABEL[slot].replace(/^Logo on /, ''),
  })),
];

const KIMONO_UPLOAD_LABEL: Record<KimonoLogoSlot, string> = {
  'left-chest': 'Left Chest',
  'left-sleeve': 'Left Sleeve',
  'right-sleeve': 'Right Sleeve',
  back: 'Back',
  'back-skirt': 'Below Belt (Back)',
};

const PANT_UPLOAD_LABEL: Record<PantLogoSlot, string> = {
  'left-pant': 'Left Thigh',
  'right-pant': 'Right Thigh',
};

/**
 * Build the customer-facing share URL for a saved design and copy it.
 * Anyone opening the link sees the design loaded on the product page and
 * can add it to cart and check out.
 */
async function copyShareLink(designId: string) {
  const url = new URL(currentGiProductConfig().shopifyProductUrl);
  url.searchParams.set('design', designId);
  const link = url.toString();
  try {
    await navigator.clipboard.writeText(link);
    toast.success('Share link copied — send it to your customer');
  } catch {
    window.prompt('Copy this share link', link);
  }
}

export const SavedDesignsRail = memo(
  ({
    status,
    savedDesigns,
    storageLabel,
    defaultDesignName,
    activeDesignId,
    activeDesignName,
    onSaveDesign,
    onLoadDesign,
    onDeleteDesign,
    onCopyCustomerLink,
    onApplyKimonoLogo,
    onApplyPantLogo,
    currentKimonoLogos,
    currentPantLogos,
  }: {
    status: DraftStatus;
    savedDesigns: GiDraftDocument[];
    storageLabel?: string;
    defaultDesignName: string;
    activeDesignId?: string | null;
    activeDesignName?: string;
    onSaveDesign: (name: string) => void;
    onLoadDesign: (design: GiDraftDocument) => void;
    onDeleteDesign: (id: string) => void;
    onCopyCustomerLink?: (design: GiDraftDocument) => void;
    onApplyKimonoLogo?: (slot: KimonoLogoSlot, logo: KimonoLogo) => void;
    onApplyPantLogo?: (slot: PantLogoSlot, logo: KimonoLogo) => void;
    currentKimonoLogos?: Partial<Record<KimonoLogoSlot, KimonoLogo>>;
    currentPantLogos?: Partial<Record<PantLogoSlot, KimonoLogo>>;
  }) => {
    const [open, setOpen] = useState(false);
    const [uploadsOpen, setUploadsOpen] = useState(false);
    const [nameDialogOpen, setNameDialogOpen] = useState(false);
    const [designName, setDesignName] = useState(defaultDesignName);
    const [uploadedLogos, setUploadedLogos] = useState<UploadedLogoItem[]>([]);
    const [applyTarget, setApplyTarget] =
      useState<LogoApplyTarget>('kimono:left-chest');
    const matchedActiveDesign = savedDesigns.find(
      (design) =>
        design.name.trim().toLowerCase() ===
        (activeDesignName || defaultDesignName).trim().toLowerCase(),
    );
    const effectiveActiveDesignId = activeDesignId ?? matchedActiveDesign?.id ?? null;
    const effectiveActiveDesignName =
      activeDesignName || matchedActiveDesign?.name || defaultDesignName;

    useEffect(() => {
      const objectUrls: string[] = [];
      const seen = new Set<string>();
      const items: UploadedLogoItem[] = [];
      const activeName = activeDesignName || defaultDesignName;

      Object.entries(currentKimonoLogos ?? {}).forEach(([slot, logo]) => {
        if (!logo) return;
        const key = `current|kimono|${slot}|${logo.filename}|${logo.imageUrl}`;
        seen.add(key);
        items.push({
          key,
          url: logo.imageUrl,
          filename: logo.filename,
          slot: `Kimono ${KIMONO_UPLOAD_LABEL[slot as KimonoLogoSlot] ?? slot}`,
          designName: activeName,
          updatedAt: new Date().toISOString(),
          imageWidth: logo.imageWidth,
          imageHeight: logo.imageHeight,
        });
      });

      Object.entries(currentPantLogos ?? {}).forEach(([slot, logo]) => {
        if (!logo) return;
        const key = `current|pant|${slot}|${logo.filename}|${logo.imageUrl}`;
        seen.add(key);
        items.push({
          key,
          url: logo.imageUrl,
          filename: logo.filename,
          slot: `Pant ${PANT_UPLOAD_LABEL[slot as PantLogoSlot] ?? slot}`,
          designName: activeName,
          updatedAt: new Date().toISOString(),
          imageWidth: logo.imageWidth,
          imageHeight: logo.imageHeight,
        });
      });

      savedDesigns.forEach((design) => {
        Object.entries(design.images.kimono).forEach(([slot, image]) => {
          if (!image) return;
          const key = `${image.filename}|${image.imageWidth}x${image.imageHeight}|${image.blob.size}`;
          if (seen.has(key)) return;
          seen.add(key);
          const url = URL.createObjectURL(image.blob);
          objectUrls.push(url);
          items.push({
            key,
            url,
            filename: image.filename,
            slot: `Kimono ${KIMONO_UPLOAD_LABEL[slot as KimonoLogoSlot] ?? slot}`,
            designName: design.name,
            updatedAt: design.updatedAt,
            imageWidth: image.imageWidth,
            imageHeight: image.imageHeight,
          });
        });

        Object.entries(design.images.pant).forEach(([slot, image]) => {
          if (!image) return;
          const key = `${image.filename}|${image.imageWidth}x${image.imageHeight}|${image.blob.size}`;
          if (seen.has(key)) return;
          seen.add(key);
          const url = URL.createObjectURL(image.blob);
          objectUrls.push(url);
          items.push({
            key,
            url,
            filename: image.filename,
            slot: `Pant ${PANT_UPLOAD_LABEL[slot as PantLogoSlot] ?? slot}`,
            designName: design.name,
            updatedAt: design.updatedAt,
            imageWidth: image.imageWidth,
            imageHeight: image.imageHeight,
          });
        });
      });

      setUploadedLogos(
        items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }, [
      activeDesignName,
      currentKimonoLogos,
      currentPantLogos,
      defaultDesignName,
      savedDesigns,
    ]);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      const openFromRail = () => {
        setUploadsOpen(false);
        setOpen(true);
      };
      const openUploadsFromRail = () => {
        setOpen(false);
        setUploadsOpen(true);
      };
      window.addEventListener('dspln:configurator-rail:saved', openFromRail);
      window.addEventListener(
        'dspln:configurator-rail:uploads',
        openUploadsFromRail,
      );
      return () => {
        window.removeEventListener('dspln:configurator-rail:saved', openFromRail);
        window.removeEventListener(
          'dspln:configurator-rail:uploads',
          openUploadsFromRail,
        );
      };
    }, []);

    const openNameDialog = () => {
      setDesignName(defaultDesignName);
      setNameDialogOpen(true);
    };

    const saveCurrentDesign = () => {
      if (effectiveActiveDesignId) {
        onSaveDesign(effectiveActiveDesignName.trim() || defaultDesignName);
        return;
      }

      openNameDialog();
    };

    const submitName = () => {
      const cleanName = designName.trim() || defaultDesignName;
      onSaveDesign(cleanName);
      setNameDialogOpen(false);
    };

    const applyLogo = (logo: UploadedLogoItem) => {
      const [part, slot] = applyTarget.split(':') as [
        'kimono' | 'pant',
        KimonoLogoSlot | PantLogoSlot,
      ];
      const nextLogo: KimonoLogo = {
        imageUrl: logo.url,
        imageWidth: logo.imageWidth,
        imageHeight: logo.imageHeight,
        filename: logo.filename,
      };

      if (part === 'kimono') {
        onApplyKimonoLogo?.(slot as KimonoLogoSlot, nextLogo);
      } else {
        onApplyPantLogo?.(slot as PantLogoSlot, nextLogo);
      }
      setUploadsOpen(false);
    };

    const statusLabel =
      status === 'loading'
        ? 'Loading'
        : status === 'saving'
          ? 'Saving'
          : status === 'error'
            ? 'Save failed'
            : null;

    return (
      <>
        <div
          className="text-foreground flex min-h-8 min-w-0 flex-1 items-center text-[10px] font-semibold tracking-[0.12em] uppercase"
          title={effectiveActiveDesignName}
        >
          <span className="truncate">
            {effectiveActiveDesignName}
          </span>
        </div>
        <button
          type="button"
          title={effectiveActiveDesignId ? 'Update this saved design' : 'Save this design'}
          aria-label={effectiveActiveDesignId ? 'Update this saved design' : 'Save this design'}
          onClick={saveCurrentDesign}
          className="bg-foreground text-background hover:bg-foreground/90 flex h-7 w-1/2 shrink-0 items-center justify-center gap-1 rounded px-1.5 font-semibold tracking-0 uppercase shadow-sm transition-colors"
        >
          <Save className="h-3 w-3 shrink-0" />
          <span className="whitespace-nowrap text-[12px] leading-none">
            {effectiveActiveDesignId ? 'Update' : 'Save Design'}
          </span>
        </button>
        {statusLabel ? (
          <div
            className={`flex min-h-5 min-w-0 items-center justify-center text-[8px] font-semibold tracking-[0.12em] uppercase ${
              status === 'error'
                ? 'text-destructive'
                : 'text-muted-foreground'
            }`}
            title={
              status === 'saving'
                ? 'Saving draft'
                : status === 'loading'
                  ? 'Loading draft'
                  : 'Draft save failed'
            }
          >
            {statusLabel}
          </div>
        ) : null}

        {open ? (
          <div className="border-border bg-background fixed top-[7.5rem] left-[calc(4.875rem+1.25rem)] z-50 w-80 rounded-lg border shadow-2xl">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                  Saved Designs
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {storageLabel ?? 'Stored on this browser'}
                </p>
              </div>
              <button
                type="button"
                className="hover:bg-muted rounded-full p-1"
                aria-label="Close saved designs"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[min(32rem,calc(100vh-10rem))] overflow-y-auto p-3">
              <button
                type="button"
                onClick={saveCurrentDesign}
                className="bg-foreground text-background hover:bg-foreground/90 flex h-10 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold tracking-[0.12em] uppercase transition-colors"
              >
                <Save className="h-4 w-4" />
                {effectiveActiveDesignId ? 'Update Current Design' : 'Save Current Design'}
              </button>

              {savedDesigns.length === 0 ? (
                <div className="text-muted-foreground flex min-h-32 flex-col items-center justify-center gap-2 text-center text-xs">
                  <Clock3 className="h-5 w-5" />
                  <p>No named designs saved yet.</p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {savedDesigns.map((design) => (
                    <li
                      key={design.id}
                      className="border-border rounded-md border p-2"
                    >
                      <div className="flex gap-3">
                        <div className="bg-muted h-14 w-12 shrink-0 overflow-hidden rounded border">
                          {design.thumbnailUrl ? (
                            <img
                              src={design.thumbnailUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {design.name}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {formatSavedTime(design.updatedAt)}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onLoadDesign(design);
                                setOpen(false);
                              }}
                              className="border-border hover:bg-muted flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                // The prop handler verifies the design
                                // exists in the cloud before copying;
                                // the plain share link is the fallback.
                                onCopyCustomerLink
                                  ? onCopyCustomerLink(design)
                                  : copyShareLink(design.id)
                              }
                              title="Copy the customer link for this design"
                              className="border-border hover:bg-muted flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Copy Link
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteDesign(design.id)}
                              className="border-border text-muted-foreground hover:text-destructive hover:bg-muted flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {uploadsOpen ? (
          <div className="border-border bg-background fixed top-[7.5rem] left-[calc(4.875rem+1.25rem)] z-50 w-[22rem] rounded-lg border shadow-2xl">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                  Uploaded Logos
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Artwork saved with your designs
                </p>
              </div>
              <button
                type="button"
                className="hover:bg-muted rounded-full p-1"
                aria-label="Close uploaded logos"
                onClick={() => setUploadsOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[min(34rem,calc(100vh-10rem))] overflow-y-auto p-3">
              {uploadedLogos.length === 0 ? (
                <div className="text-muted-foreground flex min-h-36 flex-col items-center justify-center gap-2 text-center text-xs">
                  <ImageIcon className="h-6 w-6" />
                  <p>No uploaded logos saved yet.</p>
                  <p className="max-w-56">
                    Upload artwork onto a design and save it to build this
                    library.
                  </p>
                </div>
              ) : (
                <>
                  <label className="mb-3 block">
                    <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
                      Apply to
                    </span>
                    <select
                      value={applyTarget}
                      onChange={(event) =>
                        setApplyTarget(event.target.value as LogoApplyTarget)
                      }
                      className="border-border bg-background text-foreground mt-1 h-9 w-full rounded border px-2 text-xs"
                    >
                      {APPLY_TARGETS.map((target) => (
                        <option key={target.value} value={target.value}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ul className="grid grid-cols-2 gap-2">
                  {uploadedLogos.map((logo) => (
                    <li
                      key={logo.key}
                      className="border-border overflow-hidden rounded-md border"
                    >
                      <div className="bg-muted/60 flex aspect-square items-center justify-center p-2">
                        <img
                          src={logo.url}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="p-2">
                        <p className="truncate text-xs font-semibold">
                          {logo.filename}
                        </p>
                        <p className="text-muted-foreground mt-1 truncate text-[10px] uppercase tracking-[0.12em]">
                          {logo.slot}
                        </p>
                        <p className="text-muted-foreground mt-1 truncate text-[11px]">
                          {logo.designName}
                        </p>
                        <a
                          href={logo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border-border hover:bg-muted mt-2 flex h-8 items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-[0.12em]"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => applyLogo(logo)}
                          className="bg-foreground text-background hover:bg-foreground/90 mt-1.5 flex h-8 w-full items-center justify-center rounded text-[10px] font-semibold uppercase tracking-[0.12em]"
                        >
                          Apply
                        </button>
                      </div>
                    </li>
                  ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        ) : null}

        {nameDialogOpen ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-4">
            <form
              className="border-border bg-background w-full max-w-sm rounded-lg border p-5 shadow-2xl"
              onSubmit={(event) => {
                event.preventDefault();
                submitName();
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                    Name This Design
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    This name will appear in your saved designs and production
                    packet.
                  </p>
                </div>
                <button
                  type="button"
                  className="hover:bg-muted rounded-full p-1"
                  aria-label="Close save design dialog"
                  onClick={() => setNameDialogOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <input
                autoFocus
                value={designName}
                onChange={(event) => setDesignName(event.target.value)}
                className="border-border mt-4 h-11 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus:border-foreground"
                maxLength={80}
              />

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNameDialogOpen(false)}
                  className="border-border hover:bg-muted h-10 rounded-md border px-4 text-xs font-semibold tracking-[0.12em] uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-foreground text-background hover:bg-foreground/90 h-10 rounded-md px-4 text-xs font-semibold tracking-[0.12em] uppercase"
                >
                  Save Design
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </>
    );
  },
);

SavedDesignsRail.displayName = 'SavedDesignsRail';
