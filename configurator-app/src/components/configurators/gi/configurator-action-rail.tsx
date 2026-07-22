import { memo } from 'react';
import {
  FileText,
  FolderHeart,
  HelpCircle,
  ImageIcon,
  Type,
  UserRound,
} from 'lucide-react';
import { isStudioMode } from '../shared/studio-mode';

import { openStorefrontPage } from '../shared/storefront-links';
import { LockerRailButton } from '../shared/dspln-rail-links';

function openSavedDesigns() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dspln:configurator-rail:saved'));
}

function openUploadedLogos() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dspln:configurator-rail:uploads'));
}

function openTextTool() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dspln:configurator-rail:text'));
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
    onGenerateTechPack,
  }: {
    isCustomer?: boolean;
    onLoginToSave?: () => void;
    onGenerateTechPack?: () => void;
  }) => (
    <div className="flex h-full w-full flex-col items-center">
      <div className="w-full space-y-1 pt-3">
        <LockerRailButton className={railButtonClass} />
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

        {/* Saved designs: signed-in customers (account flow shipped with
            The Locker) and studio. Uploads/text stay owner-only. */}
        {isCustomer || isStudioMode() ? (
          <button
            type="button"
            className={railButtonClass}
            onClick={openSavedDesigns}
            title="Saved designs"
          >
            <FolderHeart className="h-6 w-6 stroke-[1.7]" />
            <span className="text-[11px] font-medium leading-none">Saved</span>
          </button>
        ) : null}

        {isStudioMode() ? (
          <>
          <button
            type="button"
            className={railButtonClass}
            onClick={openUploadedLogos}
            title="Uploads"
          >
            <ImageIcon className="h-6 w-6 stroke-[1.7]" />
            <span className="text-[11px] font-medium leading-none">Uploads</span>
          </button>

          <button
            type="button"
            className={railButtonClass}
            onClick={openTextTool}
            title="Add text"
          >
            <Type className="h-6 w-6 stroke-[1.7]" />
            <span className="text-[11px] font-medium leading-none">Text</span>
          </button>
          </>
        ) : null}

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
