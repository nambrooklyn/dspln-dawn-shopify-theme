/**
 * The academy plans in the B2B app's Plan shape (choose-plan/plans.ts), so
 * its PlanCard renders them unchanged. Ids are the Stripe plugin's plan
 * names (netlify/lib/academy-plans.mjs); copy is the academy tiers.
 */

import type { LucideIcon } from 'lucide-react';
import { Palette, Rocket, Zap } from 'lucide-react';

import type { AcademyPlanId } from '../lib/academy-mode';

export interface Plan {
  id: AcademyPlanId;
  name: string;
  label: string;
  price: number;
  currency: string;
  popular: boolean;
  description: string;
  features: string[];
  icon: LucideIcon;
  tone: 'starter' | 'custom' | 'private';
}

export const plans: Plan[] = [
  {
    id: 'academy/starter',
    name: 'Starter',
    label: 'Logo It',
    price: 49,
    currency: '$',
    popular: false,
    description: 'Put your logo on our products.',
    features: [
      'Ready-made white, black & blue gis',
      'Solid-color rash guards in five belt colors',
      'Your academy logo on every product',
      'Shopify publishing',
      'DSPLN makes, ships and handles support',
    ],
    icon: Zap,
    tone: 'starter',
  },
  {
    id: 'academy/custom',
    name: 'Custom',
    label: 'Customize It',
    price: 89,
    currency: '$',
    popular: true,
    description: 'Design your own products.',
    features: [
      'Everything in Starter',
      'Full DSPLN 3D configurator',
      'Custom colors and stitching details',
      'Multiple logo & artwork placements',
      'Unlimited saved designs',
    ],
    icon: Palette,
    tone: 'custom',
  },
  {
    id: 'academy/private-label',
    name: 'Private Label',
    label: 'Brand It',
    price: 199,
    currency: '$',
    popular: false,
    description: 'Build your own brand.',
    features: [
      'Everything in Custom',
      'Custom inside prints',
      'Woven, size & brand labels',
      'Additional branding placements',
      'Private-label product presentation',
    ],
    icon: Rocket,
    tone: 'private',
  },
];

export function getPlanById(id: string | null | undefined): Plan | null {
  return plans.find((plan) => plan.id === id) ?? null;
}

export const PLAN_STORAGE_KEY = 'dspln:academy:plan';

export function readPlanChoice(): AcademyPlanId | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('plan');
    const candidate = fromUrl ?? window.localStorage.getItem(PLAN_STORAGE_KEY);
    return getPlanById(candidate) ? (candidate as AcademyPlanId) : null;
  } catch {
    return null;
  }
}

export function rememberPlanChoice(plan: AcademyPlanId | null) {
  try {
    if (plan) window.localStorage.setItem(PLAN_STORAGE_KEY, plan);
    else window.localStorage.removeItem(PLAN_STORAGE_KEY);
  } catch { /* a convenience, never a requirement */ }
}
