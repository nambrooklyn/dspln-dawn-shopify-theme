import { memo } from 'react';
import { FolderHeart, HelpCircle, ImageIcon, LogIn } from 'lucide-react';

function dispatchRailEvent(name: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
}

function openGuide() {
  if (typeof window === 'undefined') return;
  window.open('https://dspln.com/pages/how-to-use-customizer', '_top');
}

const railButtonClass =
  'group flex w-full flex-col items-center justify-center gap-1 rounded-r-2xl px-1 py-3 text-[#3f4447] transition-colors hover:bg-white hover:text-[#171717]';

export const RashguardActionRail = memo(
  ({ onLoginToSave }: { onLoginToSave?: () => void }) => (
    <div className="flex h-full w-full flex-col items-center">
      <div className="w-full space-y-1 pt-3">
        {/* Login, Saved, and Uploads are hidden on the live site until the
            account/saved-designs experience ships. */}

      </div>

      <div className="mt-auto w-full pb-4">
        <button
          type="button"
          className={railButtonClass}
          onClick={openGuide}
          title="Guide"
        >
          <HelpCircle className="h-6 w-6 stroke-[1.7]" />
          <span className="text-[11px] font-medium leading-none">Guide</span>
        </button>
      </div>
    </div>
  ),
);

RashguardActionRail.displayName = 'RashguardActionRail';
