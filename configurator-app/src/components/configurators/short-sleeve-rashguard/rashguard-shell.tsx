import { memo, useEffect, useState, type ReactNode } from 'react';

import { SkinnyRail } from '../shared/skinny-rail';
import { useShopifyIframeHeight } from '../shared/use-shopify-iframe-height';
import { RashguardLeftSidebar } from './left-sidebar';
import { RashguardMobileConfiguratorFlow } from './mobile-configurator-flow';
import { RashguardPriceSidebar } from './price-sidebar';

interface RashguardShellProps {
  onAddToCart: () => void;
  isAddingToCart?: boolean;
  cartActionLabel?: string;
  cartActionLoadingLabel?: string;
  skinnyRailContent?: ReactNode;
  railContent?: ReactNode;
  sceneTopContent?: ReactNode;
  children: ReactNode;
}

export const RashguardShell = memo(
  ({
    onAddToCart,
    isAddingToCart,
    cartActionLabel,
    cartActionLoadingLabel,
    skinnyRailContent,
    railContent,
    sceneTopContent,
    children,
  }: RashguardShellProps) => {
    const [showMobileFlow, setShowMobileFlow] = useState(false);
    useShopifyIframeHeight();

    useEffect(() => {
      if (typeof window === 'undefined') return;
      const query = window.matchMedia('(max-width: 1023px)');
      const sync = () => setShowMobileFlow(query.matches);
      sync();
      query.addEventListener('change', sync);
      return () => query.removeEventListener('change', sync);
    }, []);

    return (
      <div className="dspln-configurator-root">
        <div className="dspln-configurator-main">
          <SkinnyRail>{skinnyRailContent}</SkinnyRail>
          <RashguardLeftSidebar />
          <div className="dspln-configurator-scene">
            {sceneTopContent ? (
              <div className="pointer-events-auto absolute top-3 left-4 z-20">
                {sceneTopContent}
              </div>
            ) : null}
            {children}
          </div>
          <RashguardPriceSidebar
            onAddToCart={onAddToCart}
            isAddingToCart={isAddingToCart}
            cartActionLabel={cartActionLabel}
            cartActionLoadingLabel={cartActionLoadingLabel}
            headerContent={railContent}
          />
        </div>
        {showMobileFlow ? (
          <RashguardMobileConfiguratorFlow
            onAddToCart={onAddToCart}
            isAddingToCart={isAddingToCart}
            cartActionLabel={cartActionLabel}
            cartActionLoadingLabel={cartActionLoadingLabel}
          />
        ) : null}
      </div>
    );
  },
);

RashguardShell.displayName = 'RashguardShell';
