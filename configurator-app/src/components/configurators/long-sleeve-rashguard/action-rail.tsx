import { memo } from 'react';
import { FolderHeart, HelpCircle, ImageIcon, LogIn } from 'lucide-react';

import { openStorefrontPage } from '../shared/storefront-links';

function dispatchRailEvent(name: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
}

function openGuide() {
  openStorefrontPage('/pages/how-to-use-customizer');
}

const railButtonClass =
  'group flex w-full flex-col items-center justify-center gap-1 rounded-r-2xl px-1 py-3 text-[#3f4447] transition-colors hover:bg-white hover:text-[#171717]';

export const RashguardActionRail = memo(
  ({ onLoginToSave }: { onLoginToSave?: () => void }) => (
    <div className="flex h-full w-full flex-col items-center">
      <div className="w-full space-y-1 pt-3">
        <button
          type="button"
          className={railButtonClass}
          onClick={onLoginToSave}
          title="Log in to save later"
        >
          <LogIn className="h-6 w-6 stroke-[1.7]" />
          <span className="text-[11px] font-medium leading-none">Login</span>
        </button>

        <button
          type="button"
          className={railButtonClass}
          onClick={() => dispatchRailEvent('dspln:rashguard-rail:saved')}
          title="Saved designs"
        >
          <FolderHeart className="h-6 w-6 stroke-[1.7]" />
          <span className="text-[11px] font-medium leading-none">Saved</span>
        </button>

        <button
          type="button"
          className={railButtonClass}
          onClick={() => dispatchRailEvent('dspln:rashguard-rail:artwork')}
          title="Artwork"
        >
          <ImageIcon className="h-6 w-6 stroke-[1.7]" />
          <span className="text-[11px] font-medium leading-none">Uploads</span>
        </button>

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
