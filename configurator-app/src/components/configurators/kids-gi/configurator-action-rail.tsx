import { memo } from 'react';
import {
  FolderHeart,
  HelpCircle,
  ImageIcon,
  LogIn,
  UserRound,
} from 'lucide-react';
import { isStudioMode } from '../shared/studio-mode';

function openSavedDesigns() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dspln:configurator-rail:saved'));
}

function openUploadedLogos() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dspln:configurator-rail:uploads'));
}

function openShopifyAccount() {
  if (typeof window === 'undefined') return;
  window.open('https://dspln.com/account', '_top');
}

function openGuide() {
  if (typeof window === 'undefined') return;
  window.open('https://dspln.com/pages/how-to-use-customizer', '_top');
}

const railButtonClass =
  'group flex w-full flex-col items-center justify-center gap-1 rounded-r-2xl px-1 py-3 text-[#3f4447] transition-colors hover:bg-white hover:text-[#171717]';

export const ConfiguratorActionRail = memo(
  ({
    isCustomer,
    onLoginToSave,
  }: {
    isCustomer?: boolean;
    onLoginToSave?: () => void;
  }) => (
    <div className="flex h-full w-full flex-col items-center">
      <div className="w-full space-y-1 pt-3">
        {/* The logged-out Login button is hidden until the account flow
            ships — the theme doesn't pass customer identity yet, so the
            login round-trip appears broken to customers. */}
        {isCustomer ? (
          <button
            type="button"
            className={railButtonClass}
            onClick={openShopifyAccount}
            title="Account"
          >
            <UserRound className="h-6 w-6 stroke-[1.7]" />
            <span className="text-[11px] font-medium leading-none">
              Account
            </span>
          </button>
        ) : null}

        {/* Save/uploads UI is owner-only (?studio=1) until the
            account experience ships for customers. */}
        {isStudioMode() ? (
          <>
          <button
            type="button"
            className={railButtonClass}
            onClick={openSavedDesigns}
            title="Saved designs"
          >
            <FolderHeart className="h-6 w-6 stroke-[1.7]" />
            <span className="text-[11px] font-medium leading-none">Saved</span>
          </button>

          <button
            type="button"
            className={railButtonClass}
            onClick={openUploadedLogos}
            title="Uploads"
          >
            <ImageIcon className="h-6 w-6 stroke-[1.7]" />
            <span className="text-[11px] font-medium leading-none">Uploads</span>
          </button>
          </>
        ) : null}
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

ConfiguratorActionRail.displayName = 'ConfiguratorActionRail';
