import type { ComponentType } from 'react';

import { GiConfigurator } from './gi';
import { AdultGrapplingShortConfigurator } from './adult-grappling-short';
import { LongSleeveRashguardConfigurator } from './long-sleeve-rashguard';
import { ShortSleeveRashguardConfigurator } from './short-sleeve-rashguard';

/**
 * Map of configurator slug → React component.
 * The `configurator.$slug.tsx` route looks up the right one to render.
 * Keep this Dawn build limited to approved product groups only.
 */
export const CONFIGURATOR_REGISTRY: Record<string, ComponentType> = {
  gi: GiConfigurator,
  'womens-gi': GiConfigurator,
  'kids-gi': GiConfigurator,
  'adult-grappling-short': AdultGrapplingShortConfigurator,
  'long-sleeve-rashguard': LongSleeveRashguardConfigurator,
  'short-sleeve-rashguard': ShortSleeveRashguardConfigurator,
};

export type ConfiguratorSlug = keyof typeof CONFIGURATOR_REGISTRY;

export function getConfigurator(slug: string): ComponentType | null {
  return CONFIGURATOR_REGISTRY[slug] ?? null;
}
