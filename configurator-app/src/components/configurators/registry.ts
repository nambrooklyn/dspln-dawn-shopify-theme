import type { ComponentType } from 'react';

import { GiConfigurator } from './gi';
import { GiV2Configurator } from './gi-v2';
import { GiV3Configurator } from './gi-v3';
import { GiV4Configurator } from './gi-v4';
import { GiV5Configurator } from './gi-v5';
import { MensKimonoConfigurator } from './mens-kimono';
import { MensBeltConfigurator } from './mens-belt';
import { MensPantConfigurator } from './mens-pant';
import { AdultGrapplingShortConfigurator } from './adult-grappling-short';
import { KidsGiConfigurator } from './kids-gi';
import { KidsKimonoConfigurator } from './kids-kimono';
import { KidsBeltConfigurator } from './kids-belt';
import { KidsPantConfigurator } from './kids-pant';
import { KidsBaseballShortConfigurator } from './kids-baseball-short';
import { LongSleeveRashguardConfigurator } from './long-sleeve-rashguard';
import { ShortSleeveRashguardConfigurator } from './short-sleeve-rashguard';
import { ShortSleeveRashguardV2Configurator } from './short-sleeve-rashguard-v2';
import { WomensGiConfigurator } from './womens-gi';

/**
 * Map of configurator slug → React component.
 * The `configurator.$slug.tsx` route looks up the right one to render.
 * Keep this Dawn build limited to approved product groups only.
 */
export const CONFIGURATOR_REGISTRY: Record<string, ComponentType> = {
  gi: GiConfigurator,
  // Minimal hotspot shells — same design pipeline, different UI strategies,
  // kept side by side for comparison. v2: all hotspots at once. v3: two-level
  // (3 part dots → fan out). v4: Colors·Logos mode toggle.
  'gi-v2': GiV2Configurator,
  'gi-v3': GiV3Configurator,
  'gi-v4': GiV4Configurator,
  // v5: fixed ⊕ rail left of the model with leader lines per part.
  'gi-v5': GiV5Configurator,
  // Same v5 shell, sibling gi products (config picked by slug).
  'womens-gi-v5': GiV5Configurator,
  'kids-gi-v5': GiV5Configurator,
  'mens-kimono': MensKimonoConfigurator,
  'mens-belt': MensBeltConfigurator,
  'mens-pant': MensPantConfigurator,
  'womens-gi': WomensGiConfigurator,
  'kids-gi': KidsGiConfigurator,
  'kids-kimono': KidsKimonoConfigurator,
  'kids-belt': KidsBeltConfigurator,
  'kids-pant': KidsPantConfigurator,
  'adult-grappling-short': AdultGrapplingShortConfigurator,
  'kids-baseball-short': KidsBaseballShortConfigurator,
  'long-sleeve-rashguard': LongSleeveRashguardConfigurator,
  'short-sleeve-rashguard': ShortSleeveRashguardConfigurator,
  // Minimal hotspot-based shell (v2) — same design pipeline, new UI. Test bed.
  'short-sleeve-rashguard-v2': ShortSleeveRashguardV2Configurator,
};

export type ConfiguratorSlug = keyof typeof CONFIGURATOR_REGISTRY;

export function getConfigurator(slug: string): ComponentType | null {
  return CONFIGURATOR_REGISTRY[slug] ?? null;
}
