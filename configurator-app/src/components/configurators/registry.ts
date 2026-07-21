import type { ComponentType } from 'react';

import { GiConfigurator } from './gi';
import { MensKimonoConfigurator } from './mens-kimono';
import { MensBeltConfigurator } from './mens-belt';
import { MensPantConfigurator } from './mens-pant';
import { AdultGrapplingShortConfigurator } from './adult-grappling-short';
import { KidsGiConfigurator } from './kids-gi';
import { KidsKimonoConfigurator } from './kids-kimono';
import { KidsBeltConfigurator } from './kids-belt';
import { KidsPantConfigurator } from './kids-pant';
import { LongSleeveRashguardConfigurator } from './long-sleeve-rashguard';
import { ShortSleeveRashguardConfigurator } from './short-sleeve-rashguard';
import { WomensGiConfigurator } from './womens-gi';

/**
 * Map of configurator slug → React component.
 * The `configurator.$slug.tsx` route looks up the right one to render.
 * Keep this Dawn build limited to approved product groups only.
 */
export const CONFIGURATOR_REGISTRY: Record<string, ComponentType> = {
  gi: GiConfigurator,
  'mens-kimono': MensKimonoConfigurator,
  'mens-belt': MensBeltConfigurator,
  'mens-pant': MensPantConfigurator,
  'womens-gi': WomensGiConfigurator,
  'kids-gi': KidsGiConfigurator,
  'kids-kimono': KidsKimonoConfigurator,
  'kids-belt': KidsBeltConfigurator,
  'kids-pant': KidsPantConfigurator,
  'adult-grappling-short': AdultGrapplingShortConfigurator,
  'long-sleeve-rashguard': LongSleeveRashguardConfigurator,
  'short-sleeve-rashguard': ShortSleeveRashguardConfigurator,
};

export type ConfiguratorSlug = keyof typeof CONFIGURATOR_REGISTRY;

export function getConfigurator(slug: string): ComponentType | null {
  return CONFIGURATOR_REGISTRY[slug] ?? null;
}
