import { memo } from 'react';
import {
  FileText,
  FolderHeart,
  HelpCircle,
  ImageIcon,
  LogIn,
  UserRound,
} from 'lucide-react';

import { openStorefrontPage } from '../shared/storefront-links';

function openSavedDesigns() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dspln:configurator-rail:saved'));
}

function openUploadedLogos() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dspln:configurator-rail:uploads'));
}

function openShopifyAccount() {
  openStorefrontPage('/account');
}

function openGuide() {
  openStorefrontPage('/pages/how-to-use-customizer');
}

const railButtonClass =
  'group flex w-full flex-col items-center justify-center gap-1 rounded-r-2xl px-1 py-3 text-[#3f4447] transition-colors hover:bg-white hover:text-[#171717]';

export const ConfiguratorActionRail = memo(
  ({
    isCustomer,
    onLoginToSave,
    onGenerateTechPack,
  }: {
    isCustomer?: boolean;
    onLoginToSave?: () => void;
    onGenerateTechPack?: () => void;
  }) => (
    <div className="flex h-full w-full flex-col items-center">
      <div className="w-full space-y-1 pt-3">
        <button
          type="button"
          className={railButtonClass}
          onClick={() => (isCustomer ? openShopifyAccount() : onLoginToSave?.())}
          title={isCustomer ? 'Account' : 'Log in to save'}
        >
          {isCustomer ? (
            <UserRound className="h-6 w-6 stroke-[1.7]" />
          ) : (
            <LogIn className="h-6 w-6 stroke-[1.7]" />
          )}
          <span className="text-[11px] font-medium leading-none">
            {isCustomer ? 'Account' : 'Login'}
          </span>
        </button>

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

        {onGenerateTechPack ? (
          <button
            type="button"
            className={railButtonClass}
            onClick={onGenerateTechPack}
            title="Temporary tech pack"
          >
            <FileText className="h-6 w-6 stroke-[1.7]" />
            <span className="text-[11px] font-medium leading-none">Tech</span>
          </button>
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
