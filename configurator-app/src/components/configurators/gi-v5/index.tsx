import { createGiMinimalConfigurator } from '../gi-v2';
import { GiV5Shell } from './v5-shell';

/**
 * V5 — annotation-rail shell: a fixed vertical column of ⊕ markers left of
 * the model with live leader lines to each part; tapping one reveals that
 * part's hotspots. Same order/state pipeline via createGiMinimalConfigurator.
 */
export const GiV5Configurator = createGiMinimalConfigurator(
  GiV5Shell,
  'GiV5Configurator',
  // Rest wider than 'front' — hydration lands here instead of stomping the
  // shell's zoomed-out default.
  'front-far',
);
