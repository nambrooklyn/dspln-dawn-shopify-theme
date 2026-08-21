import { createGiMinimalConfigurator } from './factory';
import { GiV5Shell } from './v5-shell';

/**
 * V5 minimal shell mounted on the kids-gi pipeline (its own GLB, mesh
 * maps, anchors, storage) — the same per-product-folder pattern v1 uses.
 */
export const KidsGiV5Configurator = createGiMinimalConfigurator(
  GiV5Shell,
  'KidsGiV5Configurator',
  'front-far',
);
