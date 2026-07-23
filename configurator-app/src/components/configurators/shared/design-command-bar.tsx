import { memo, useState } from 'react';
import { MoreHorizontal, Share2 } from 'lucide-react';
import { lockerUrl } from './dspln-rail-links';

type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';

interface DesignCommandBarProps {
  designId: string | null;
  designName: string;
  hasUnsavedChanges: boolean;
  lastEditedAt: string | null;
  status: SaveStatus;
  onSave: (name: string) => Promise<string | null>;
  onSaveAs: (name: string) => Promise<string | null>;
  onShare: (designId?: string) => Promise<void>;
}

function lastEditedLabel(
  status: SaveStatus,
  hasUnsavedChanges: boolean,
  lastEditedAt: string | null,
) {
  if (status === 'saving') return 'Saving…';
  if (status === 'error') return 'Save failed — try again';
  if (hasUnsavedChanges) return 'Unsaved changes';
  if (!lastEditedAt) return 'Not saved yet';

  const edited = new Date(lastEditedAt);
  const now = new Date();
  const sameDay = edited.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = edited.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (sameDay) return `Last edited today at ${time}`;
  if (edited.toDateString() === yesterday.toDateString()) {
    return `Last edited yesterday at ${time}`;
  }
  return `Last edited ${edited.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: edited.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })} at ${time}`;
}

export const DesignCommandBar = memo(
  ({
    designId,
    designName,
    hasUnsavedChanges,
    lastEditedAt,
    status,
    onSave,
    onSaveAs,
    onShare,
  }: DesignCommandBarProps) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'save' | 'saveAs' | null>(null);
    const [shareAfterSave, setShareAfterSave] = useState(false);
    const [nameDraft, setNameDraft] = useState(designName);

    const openNameDialog = (mode: 'save' | 'saveAs', thenShare = false) => {
      setNameDraft(mode === 'saveAs' ? `${designName} Copy` : designName);
      setShareAfterSave(thenShare);
      setDialogMode(mode);
      setMenuOpen(false);
    };

    const submitName = async () => {
      const cleanName = nameDraft.trim();
      if (!cleanName || !dialogMode) return;
      const savedId =
        dialogMode === 'save'
          ? await onSave(cleanName)
          : await onSaveAs(cleanName);
      setDialogMode(null);
      if (savedId && shareAfterSave) await onShare(savedId);
      setShareAfterSave(false);
    };

    const save = async () => {
      if (!designId) {
        openNameDialog('save');
        return;
      }
      await onSave(designName);
    };

    const share = async () => {
      setMenuOpen(false);
      if (!designId) {
        openNameDialog('save', true);
        return;
      }
      await onShare();
    };

    return (
      <>
        <div className="relative sm:hidden">
          <button
            type="button"
            aria-label="Design actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="text-foreground hover:text-muted-foreground p-1"
          >
            <MoreHorizontal className="h-6 w-6" />
          </button>

          {menuOpen ? (
            <div className="border-border bg-background absolute top-full right-0 z-50 mt-1 w-48 rounded border p-1 shadow-xl">
              <button
                type="button"
                disabled={status === 'saving' || (Boolean(designId) && !hasUnsavedChanges)}
                onClick={() => {
                  setMenuOpen(false);
                  void save();
                }}
                className="hover:bg-muted w-full rounded px-3 py-2 text-left text-xs disabled:opacity-45"
              >
                {status === 'saving' ? 'Saving…' : 'Save design'}
              </button>
              <button
                type="button"
                onClick={() => openNameDialog('saveAs')}
                className="hover:bg-muted w-full rounded px-3 py-2 text-left text-xs"
              >
                Save as a new design
              </button>
              <button
                type="button"
                onClick={() => void share()}
                className="hover:bg-muted w-full rounded px-3 py-2 text-left text-xs"
              >
                Share design
              </button>
              <a
                href={lockerUrl()}
                target="_top"
                className="hover:bg-muted block w-full rounded px-3 py-2 text-left text-xs"
              >
                Open The Locker
              </a>
            </div>
          ) : null}
        </div>

        <div className="border-border/80 bg-background/95 hidden w-full max-w-[54rem] items-center justify-between gap-3 rounded-lg border px-3 py-2 shadow-sm backdrop-blur sm:flex">
          <div className="min-w-0">
            <p className="text-foreground truncate text-xs font-semibold tracking-[0.08em] uppercase">
              {designName}
            </p>
            <p
              className={`mt-0.5 text-[10px] ${
                status === 'error'
                  ? 'text-destructive'
                  : hasUnsavedChanges
                    ? 'text-amber-700'
                    : 'text-muted-foreground'
              }`}
            >
              {lastEditedLabel(status, hasUnsavedChanges, lastEditedAt)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={status === 'saving' || (Boolean(designId) && !hasUnsavedChanges)}
              className="bg-foreground text-background hover:bg-foreground/85 min-w-20 rounded px-4 py-2 text-[10px] font-semibold tracking-[0.14em] uppercase disabled:cursor-default disabled:opacity-45"
            >
              {status === 'saving' ? 'Saving…' : 'Save'}
            </button>

            <button
              type="button"
              onClick={() => openNameDialog('saveAs')}
              className="border-border text-foreground hover:bg-muted hidden rounded border px-3 py-2 text-[10px] font-semibold tracking-[0.12em] uppercase sm:block"
            >
              Save As
            </button>

            <button
              type="button"
              onClick={() => void share()}
              className="border-border text-foreground hover:bg-muted hidden items-center gap-1.5 rounded border px-3 py-2 text-[10px] font-semibold tracking-[0.12em] uppercase md:flex"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>

            <div className="relative">
              <button
                type="button"
                aria-label="Design actions"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="border-border text-foreground hover:bg-muted rounded border p-2"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen ? (
                <div className="border-border bg-background absolute top-full right-0 z-50 mt-2 w-44 rounded border p-1 shadow-xl">
                  <a
                    href={lockerUrl()}
                    target="_top"
                    className="hover:bg-muted block w-full rounded px-3 py-2 text-left text-xs"
                  >
                    Open The Locker
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {dialogMode ? (
          <div className="bg-foreground/30 fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="border-border bg-background w-full max-w-sm rounded-lg border p-5 shadow-2xl">
              <p className="text-foreground text-sm font-semibold tracking-[0.12em] uppercase">
                {dialogMode === 'save' ? 'Name your design' : 'Save as a new design'}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                {dialogMode === 'save'
                  ? 'This name will appear in My Designs in The Locker.'
                  : 'Your original design will remain unchanged.'}
              </p>
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitName();
                }}
                autoFocus
                className="border-border mt-4 h-11 w-full rounded border bg-transparent px-3 text-sm outline-none focus:border-foreground"
                aria-label="Design name"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDialogMode(null);
                    setShareAfterSave(false);
                  }}
                  className="border-border rounded border px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!nameDraft.trim() || status === 'saving'}
                  onClick={() => void submitName()}
                  className="bg-foreground text-background rounded px-4 py-2 text-xs font-semibold disabled:opacity-45"
                >
                  {shareAfterSave ? 'Save & Share' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  },
);

DesignCommandBar.displayName = 'DesignCommandBar';
