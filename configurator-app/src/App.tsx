import { Toaster } from 'sonner';

import { GiConfigurator } from './components/configurators/gi';
import { getConfigurator } from './components/configurators/registry';
import { MobileOverflowDiagnostic } from './components/mobile-overflow-diagnostic';
import { TheLocker } from './components/locker/the-locker';
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
  const isLocker =
    path === '/locker' ||
    path.startsWith('/locker/') ||
    path === '/portal' ||
    path.startsWith('/portal/');

  return (
    <>
      {isLocker ? (
        <TheLocker />
      ) : path === '/tech-pack/gi' ? (
        <TechPackDownloadPage />
      ) : path === '/tech-pack/rashguard' ? (
        <RashguardTechPackDownloadPage />
      ) : isProductionDashboard ? (
        <ProductionDashboard />
      ) : Configurator ? (
        <Configurator />
      ) : (
        <GiConfigurator />
      )}
      <Toaster richColors position="bottom-right" />
      <MobileOverflowDiagnostic />
    </>
  );
}
