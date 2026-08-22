import { createGiMinimalConfigurator } from '../gi-v2';
import { GiV4Shell } from './v4-shell';

/**
 * V4 — mode-toggle shell (Colors · Logos, one hotspot family at a time).
 * Same order/state pipeline as v2 via createGiMinimalConfigurator.
 */
export const GiV4Configurator = createGiMinimalConfigurator(
  GiV4Shell,
  'GiV4Configurator',
);
