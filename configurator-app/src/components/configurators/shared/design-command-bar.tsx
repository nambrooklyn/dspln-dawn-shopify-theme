import { memo, useState } from 'react';
import {
  Facebook,
  ImageIcon,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  MessageSquareText,
  Download,
  MoreHorizontal,
  Music2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { downloadArtworkFile } from './artwork-download';
import { toast } from 'sonner';
import { lockerUrl } from './dspln-rail-links';
import { copyTextToClipboard } from './studio-mode';

type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';

const SHARE_TARGETS: Array<{
  name: string;
  color: string;
  Icon?: LucideIcon;
  glyph?: string;
  href: (url: string, title: string) => string;
  /** Platforms with no web share intent: copy the link on click, then
   *  open the platform so the customer can paste it. */
  copyLink?: boolean;
}> = [
  {
    name: 'Messages',
    color: '#34C759',
    Icon: MessageSquareText,
    href: (url, title) =>
      `sms:?&body=${encodeURIComponent(`${title} ${url}`)}`,
  },
  {
    name: 'WhatsApp',
    color: '#25D366',
    Icon: MessageCircle,
    href: (url, title) =>
      `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
  },
  {
    name: 'X',
    color: '#000000',
    glyph: 'X',
    href: (url, title) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    name: 'Instagram',
    color: '#E1306C',
    Icon: Instagram,
    href: () => 'https://www.instagram.com',
    copyLink: true,
  },
  {
    name: 'TikTok',
    color: '#010101',
    Icon: Music2,
    href: () => 'https://www.tiktok.com',
    copyLink: true,
  },
  {
    name: 'Facebook',
    color: '#1877F2',
    Icon: Facebook,
    href: (url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: 'Reddit',
    color: '#FF4500',
    glyph: 'r/',
    href: (url, title) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
  {
    name: 'Pinterest',
    color: '#E60023',
    glyph: 'P',
    href: (url, title) =>
      `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(title)}`,
  },
  {
    name: 'LinkedIn',
    color: '#0A66C2',
    Icon: Linkedin,
    href: (url) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'Email',
    color: '#64748B',
    Icon: Mail,
    href: (url, title) =>
      `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
  },
];

export interface CommandBarUpload {
  key: string;
  url: string;
  filename?: string;
}

interface DesignCommandBarProps {
  designId: string | null;
  designName: string;
  hasUnsavedChanges: boolean;
  lastEditedAt: string | null;
  status: SaveStatus;
  onSave: (name: string) => Promise<string | null>;
  onSaveAs: (name: string) => Promise<string | null>;
  /** Save if needed and return the design's share URL (null on failure). */
  onShare: (designId?: string) => Promise<string | null>;
  uploads?: CommandBarUpload[];
  uploadTargets?: Array<{ value: string; label: string }>;
  onApplyUpload?: (uploadKey: string, target: string) => void;
}

export const DesignCommandBar = memo(
  ({
    designId,
    designName,
    hasUnsavedChanges,
    status,
    onSave,
    onSaveAs,
    onShare,
    uploads,
    uploadTargets,
    onApplyUpload,
  }: DesignCommandBarProps) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'save' | 'saveAs' | null>(null);
    const [shareAfterSave, setShareAfterSave] = useState(false);
    const [nameDraft, setNameDraft] = useState(designName);
    const [uploadsOpen, setUploadsOpen] = useState(false);
    const [uploadTarget, setUploadTarget] = useState(
      uploadTargets?.[0]?.value ?? '',
    );
    const [shareUrl, setShareUrl] = useState<string | null>(null);

    const copyShareUrl = async () => {
      if (!shareUrl) return;
      const copied = await copyTextToClipboard(shareUrl);
      if (copied) toast.success('Share link copied');
      else toast.error('Could not copy — select the link and copy it manually');
    };

    const uploadsMenuItem = onApplyUpload ? (
      <button
        type="button"
        onClick={() => {
          setMenuOpen(false);
          setUploadsOpen(true);
        }}
        className="hover:bg-muted w-full rounded px-3 py-2 text-left text-xs"
      >
        Uploads
      </button>
    ) : null;

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
      if (savedId && shareAfterSave) {
        const url = await onShare(savedId);
        if (url) setShareUrl(url);
      }
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
      const url = await onShare();
      if (url) setShareUrl(url);
    };

    return (
      <>
        <div className="flex w-full justify-end">
          <div className="relative">
          <button
            type="button"
            aria-label="Design actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="border-border bg-background/95 text-foreground hover:bg-muted rounded border p-2 shadow-sm"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>

          {menuOpen ? (
            <div className="border-border bg-background absolute top-full right-0 z-50 mt-1 w-48 rounded border p-1 shadow-xl">
              <p
                className="text-foreground border-border truncate border-b px-3 pt-2 pb-2.5 text-xs font-semibold tracking-[0.08em] uppercase"
                title={designName}
              >
                {designName}
              </p>
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
              {uploadsMenuItem}
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

        {uploadsOpen ? (
          <div
            className="bg-foreground/20 fixed inset-0 z-[90]"
            onClick={() => setUploadsOpen(false)}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="border-border bg-background fixed top-24 right-4 z-[95] w-60 rounded-lg border p-2 shadow-2xl sm:right-8"
            >
              <div className="flex items-center justify-between gap-2 pb-2">
                {uploadTargets?.length ? (
                  <select
                    value={uploadTarget}
                    onChange={(event) => setUploadTarget(event.target.value)}
                    aria-label="Apply artwork to"
                    className="border-border bg-background text-foreground h-8 min-w-0 flex-1 rounded border px-2 text-xs"
                  >
                    {uploadTargets.map((target) => (
                      <option key={target.value} value={target.value}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  aria-label="Close uploads"
                  onClick={() => setUploadsOpen(false)}
                  className="hover:bg-muted rounded-full p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {uploads?.length ? (
                <ul className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
                  {uploads.map((upload) => (
                    <li key={upload.key} className="relative">
                      <button
                        type="button"
                        aria-label="Apply this artwork"
                        onClick={() => {
                          onApplyUpload?.(upload.key, uploadTarget);
                          setUploadsOpen(false);
                        }}
                        className="border-border bg-muted/60 hover:ring-foreground/40 flex aspect-square w-full items-center justify-center overflow-hidden rounded border p-1 hover:ring-2"
                      >
                        <img
                          src={upload.url}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                        />
                      </button>
                      <button
                        type="button"
                        aria-label="Download this artwork"
                        title="Download this artwork"
                        onClick={() =>
                          void downloadArtworkFile(upload.url, upload.filename)
                        }
                        className="bg-background/90 border-border text-foreground absolute top-0.5 right-0.5 rounded border p-0.5"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-muted-foreground flex min-h-24 items-center justify-center">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
            </div>
          </div>
        ) : null}

        {shareUrl ? (
          <div
            className="bg-foreground/30 fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={() => setShareUrl(null)}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="border-border bg-background w-full max-w-sm rounded-lg border p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <p className="text-foreground text-sm font-semibold tracking-[0.12em] uppercase">
                  Share design
                </p>
                <button
                  type="button"
                  aria-label="Close share"
                  onClick={() => setShareUrl(null)}
                  className="hover:bg-muted rounded-full p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {SHARE_TARGETS.map((target) => (
                  <a
                    key={target.name}
                    href={target.href(shareUrl, designName)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (target.copyLink) void copyShareUrl();
                    }}
                    className="flex w-14 shrink-0 flex-col items-center gap-1.5"
                  >
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: target.color }}
                    >
                      {target.Icon ? (
                        <target.Icon className="h-5 w-5" />
                      ) : (
                        <span className="text-base font-bold">
                          {target.glyph}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      {target.name}
                    </span>
                  </a>
                ))}
              </div>
              <div className="border-border mt-4 flex items-center gap-2 rounded-lg border p-2">
                <p
                  className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
                  title={shareUrl}
                >
                  {shareUrl}
                </p>
                <button
                  type="button"
                  onClick={() => void copyShareUrl()}
                  className="bg-foreground text-background hover:bg-foreground/85 shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        ) : null}

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
