import { Toaster } from 'sonner';

import { GiConfigurator } from './components/configurators/gi';
import { getConfigurator } from './components/configurators/registry';
import { ProductionDashboard } from './components/production-dashboard';

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
      {isProductionDashboard ? (
        <ProductionDashboard />
      ) : Configurator ? (
        <Configurator />
      ) : (
        <GiConfigurator />
      )}
      <Toaster richColors position="bottom-right" />
    </>
  );
}
