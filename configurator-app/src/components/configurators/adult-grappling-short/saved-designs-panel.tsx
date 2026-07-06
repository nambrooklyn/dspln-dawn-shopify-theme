import { memo, useEffect, useState } from 'react';
import { Clock3, Save, Trash2, X } from 'lucide-react';

import type { RashguardDraftDocument } from './rashguard-storage';

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

export const RashguardSavedDesignsPanel = memo(
  ({
    status,
    savedDesigns,
    defaultDesignName,
    activeDesignId,
    activeDesignName,
    onSaveDesign,
    onLoadDesign,
    onDeleteDesign,
  }: {
    status: DraftStatus;
    savedDesigns: RashguardDraftDocument[];
    defaultDesignName: string;
    activeDesignId?: string | null;
    activeDesignName?: string;
    onSaveDesign: (name: string) => void;
    onLoadDesign: (design: RashguardDraftDocument) => void;
    onDeleteDesign: (id: string) => void;
  }) => {
    const [open, setOpen] = useState(false);
    const [nameDialogOpen, setNameDialogOpen] = useState(false);
    const [designName, setDesignName] = useState(defaultDesignName);
    const effectiveName = activeDesignName || defaultDesignName;

    useEffect(() => {
      if (typeof window === 'undefined') return;
      const openFromRail = () => setOpen(true);
      window.addEventListener('dspln:rashguard-rail:saved', openFromRail);
      return () =>
        window.removeEventListener('dspln:rashguard-rail:saved', openFromRail);
    }, []);

    const saveCurrentDesign = () => {
      if (activeDesignId) {
        onSaveDesign(effectiveName);
        return;
      }
      setDesignName(effectiveName);
      setNameDialogOpen(true);
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
          title={effectiveName}
        >
          <span className="truncate">{effectiveName}</span>
        </div>
        <button
          type="button"
          title={activeDesignId ? 'Update this saved design' : 'Save this design'}
          aria-label={activeDesignId ? 'Update this saved design' : 'Save this design'}
          onClick={saveCurrentDesign}
          className="bg-foreground text-background hover:bg-foreground/90 flex h-7 w-1/2 shrink-0 items-center justify-center gap-1 rounded px-1.5 font-semibold tracking-0 uppercase shadow-sm transition-colors"
        >
          <Save className="h-3 w-3 shrink-0" />
          <span className="whitespace-nowrap text-[12px] leading-none">
            {activeDesignId ? 'Update' : 'Save Design'}
          </span>
        </button>
        {statusLabel ? (
          <div
            className={`flex min-h-5 min-w-0 items-center justify-center text-[8px] font-semibold tracking-[0.12em] uppercase ${
              status === 'error' ? 'text-destructive' : 'text-muted-foreground'
            }`}
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
                  Stored locally in this browser
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
                {activeDesignId ? 'Update Current Design' : 'Save Current Design'}
              </button>

              {savedDesigns.length === 0 ? (
                <div className="text-muted-foreground flex min-h-32 flex-col items-center justify-center gap-2 text-center text-xs">
                  <Clock3 className="h-5 w-5" />
                  <p>No named rashguard designs saved yet.</p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {savedDesigns.map((design) => (
                    <li
                      key={design.id}
                      className={`border-border rounded-md border p-2 ${
                        design.id === activeDesignId ? 'bg-muted/50' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onLoadDesign(design);
                          setOpen(false);
                        }}
                        className="flex w-full gap-3 text-left"
                      >
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
                          <p className="truncate text-xs font-semibold">
                            {design.name}
                          </p>
                          <p className="text-muted-foreground mt-1 text-[11px]">
                            {formatSavedTime(design.updatedAt)}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDesign(design.id)}
                        className="text-muted-foreground hover:text-destructive mt-2 inline-flex items-center gap-1 text-[11px]"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {nameDialogOpen ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
            <div className="bg-background w-full max-w-sm rounded-lg border p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Name this design</p>
                <button
                  type="button"
                  className="hover:bg-muted rounded-full p-1"
                  onClick={() => setNameDialogOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                value={designName}
                onChange={(event) => setDesignName(event.target.value)}
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  onSaveDesign(designName.trim() || defaultDesignName);
                  setNameDialogOpen(false);
                }}
                className="bg-foreground text-background hover:bg-foreground/90 mt-3 h-10 w-full rounded-md text-xs font-semibold tracking-[0.12em] uppercase"
              >
                Save Design
              </button>
            </div>
          </div>
        ) : null}
      </>
    );
  },
);

RashguardSavedDesignsPanel.displayName = 'RashguardSavedDesignsPanel';
