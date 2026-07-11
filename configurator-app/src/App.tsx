import { Toaster } from 'sonner';

import { GiConfigurator } from './components/configurators/gi';
import { getConfigurator } from './components/configurators/registry';
import { MobileDeviceNotice } from './components/mobile-device-notice';
import { ProductionDashboard } from './components/production-dashboard';
import { RashguardTechPackDownloadPage } from './components/rashguard-tech-pack-download-page';
import { TechPackDownloadPage } from './components/tech-pack-download-page';

export function App() {
  const path =
    typeof window !== 'undefined'
      ? window.location.pathname.replace(/\/+$/, '')
      : '';
  const isProductionDashboard =
    typeof window !== 'undefined' &&
    ['/production', '/account/designs', '/account/logos'].includes(
      path,
    );
  const configuratorSlug = path.match(/^\/configurator\/([^/]+)$/)?.[1];
  const Configurator =
    configuratorSlug ? getConfigurator(configuratorSlug) : GiConfigurator;

  return (
    <>
      {path === '/tech-pack/gi' ? (
        <TechPackDownloadPage />
      ) : path === '/tech-pack/rashguard' ? (
        <RashguardTechPackDownloadPage />
      ) : isProductionDashboard ? (
        <ProductionDashboard />
      ) : Configurator ? (
        <>
          <MobileDeviceNotice />
          <Configurator />
        </>
      ) : (
        <>
          <MobileDeviceNotice />
          <GiConfigurator />
        </>
      )}
      <Toaster richColors position="bottom-right" />
    </>
  );
}
