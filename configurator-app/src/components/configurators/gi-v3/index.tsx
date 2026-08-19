import { createGiMinimalConfigurator } from '../gi-v2';
import { GiV3Shell } from './v3-shell';

/**
 * V3 — two-level hotspot shell (reveal on tap → 3 part dots → fan-out).
 * Same order/state pipeline as v2 via createGiMinimalConfigurator.
 */
export const GiV3Configurator = createGiMinimalConfigurator(
  GiV3Shell,
  'GiV3Configurator',
);
