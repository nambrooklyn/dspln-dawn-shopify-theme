import { Toaster } from 'sonner';

import { GiConfigurator } from './components/configurators/gi';
import { getConfigurator } from './components/configurators/registry';
import { MobileOverflowDiagnostic } from './components/mobile-overflow-diagnostic';
import { TheLocker } from './components/locker/the-locker';
import { AcademyApp } from './academy/academy-app';
import { AdminLocker } from './components/locker/admin-locker';
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
    // '/production' was removed: it exposed every customer design and upload
    // with no login. Admin browsing moves to the factory portal (behind auth);
    // the /account/* views stay — they are scoped to the signed-in customer.
    ['/account/designs', '/account/logos'].includes(
      path,
    );
  const configuratorSlug = path.match(/^\/configurator\/([^/]+)$/)?.[1];
  const Configurator =
    configuratorSlug ? getConfigurator(configuratorSlug) : GiConfigurator;
  // The academies' own front door. Its own host serves it at the root; the
  // /academy paths on the Locker host keep working for links already sent.
  // A retail Locker account never sees academy sign-up either way.
  const onAcademyHost =
    typeof window !== 'undefined' && window.location.hostname === 'academy.dspln.com';
  const isAcademySignup = onAcademyHost || path === '/academy' || path.startsWith('/academy/');
  const isLocker =
    path === '/locker' ||
    path.startsWith('/locker/') ||
    path === '/portal' ||
    path.startsWith('/portal/');

  return (
    <>
      {path === '/admin-locker' ? (
        <AdminLocker />
      ) : isAcademySignup ? (
        <AcademyApp />
      ) : isLocker ? (
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
