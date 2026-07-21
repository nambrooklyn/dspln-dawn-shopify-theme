import { memo, useEffect, useState, type ReactNode } from 'react';

import { LeftSidebar3D } from './left-sidebar-3d';
import { PriceSidebar } from './price-sidebar';
import { SkinnyRail } from '../shared/skinny-rail';
import { MobileConfiguratorFlow } from './mobile-configurator-flow';
import { useShopifyIframeHeight } from '../shared/use-shopify-iframe-height';

interface ConfiguratorShellProps {
  onAddToCart: () => void;
  onExport: () => void;
  isAddingToCart?: boolean;
  isExporting?: boolean;
  cartActionLabel?: string;
  cartActionLoadingLabel?: string;
  skinnyRailContent?: ReactNode;
  railContent?: ReactNode;
  sceneTopContent?: ReactNode;
  children: ReactNode; // the center 3D scene
}

/**
 * Shared chrome for every product configurator.
 *
 * Layout (left → right):
 *   [skinny rail] [main left sidebar with part tabs]
 *                       [3D scene + Front/Back overlay]
 *                                          [right price sidebar]
 *
 * Each per-part section in the left sidebar mirrors a corresponding
 * accordion section on the D2C reference (dspln.com/products/customgi).
 */
export const ConfiguratorShell = memo(
  ({
    onAddToCart,
    onExport,
    isAddingToCart,
    isExporting,
    cartActionLabel,
    cartActionLoadingLabel,
    skinnyRailContent,
    railContent,
    sceneTopContent,
    children,
  }: ConfiguratorShellProps) => {
    const [showMobileFlow, setShowMobileFlow] = useState(false);
    void onExport;
    void isExporting;
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
          <LeftSidebar3D />
          <div className="dspln-configurator-scene">
            {sceneTopContent ? (
              <div className="pointer-events-auto absolute top-3 left-4 z-20">
                {sceneTopContent}
              </div>
            ) : null}
            {children}
          </div>
          <PriceSidebar
            onAddToCart={onAddToCart}
            isAddingToCart={isAddingToCart}
            cartActionLabel={cartActionLabel}
            cartActionLoadingLabel={cartActionLoadingLabel}
            headerContent={railContent}
          />
        </div>
        {showMobileFlow ? (
          <div className="lg:hidden">
            <MobileConfiguratorFlow
              onAddToCart={onAddToCart}
              isAddingToCart={isAddingToCart}
              cartActionLabel={cartActionLabel}
              cartActionLoadingLabel={cartActionLoadingLabel}
            />
          </div>
        ) : null}
      </div>
    );
  },
);

ConfiguratorShell.displayName = 'ConfiguratorShell';
