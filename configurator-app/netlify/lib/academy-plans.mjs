// The three academy plans. Names are the Better Auth subscription plan ids
// (the plugin lowercases them), and match academy-entitlements.ts in the
// b2b-platform parts bin so the two never disagree.
//
// Price ids come from env so test and live Stripe accounts can differ, and
// so a price change is a dashboard action, not a deploy:
//   STRIPE_PRICE_ACADEMY_STARTER        Starter "Logo It"          $49 / month
//   STRIPE_PRICE_ACADEMY_CUSTOM         Custom "Customize It"      $89 / month
//   STRIPE_PRICE_ACADEMY_PRIVATE_LABEL  Private Label "Brand It"  $199 / month

export const ACADEMY_PLANS = [
  {
    name: 'academy/starter',
    envKey: 'STRIPE_PRICE_ACADEMY_STARTER',
    limits: { logoOnlyProducts: true, customConfigurator: false, privateLabelBranding: false, shopifyPublishing: true },
  },
  {
    name: 'academy/custom',
    envKey: 'STRIPE_PRICE_ACADEMY_CUSTOM',
    limits: { logoOnlyProducts: true, customConfigurator: true, privateLabelBranding: false, shopifyPublishing: true },
  },
  {
    name: 'academy/private-label',
    envKey: 'STRIPE_PRICE_ACADEMY_PRIVATE_LABEL',
    limits: { logoOnlyProducts: true, customConfigurator: true, privateLabelBranding: true, shopifyPublishing: true },
  },
];

/** Plans the plugin can sell: only those with a price id configured. */
export function configuredPlans(env = process.env) {
  return ACADEMY_PLANS.filter((plan) => env[plan.envKey]).map((plan) => ({
    name: plan.name,
    priceId: env[plan.envKey],
    limits: plan.limits,
  }));
}

export function stripeIsConfigured(env = process.env) {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}
