export type GiProductKey =
  | 'mens'
  | 'kids'
  | 'womens'
  | 'mens-kimono'
  | 'mens-belt'
  | 'mens-pant';

export interface GiProductConfig {
  key: GiProductKey;
  slug: string;
  stateKind:
    | 'gi'
    | 'kids-gi'
    | 'womens-gi'
    | 'mens-kimono'
    | 'mens-belt'
    | 'mens-pant';
  productName: string;
  productTitle: string;
  shopifyProductPath: string;
  shopifyProductHandle: string;
  shopifyProductUrl: string;
  modelUrl: string;
  designNamePrefix: string;
  savedDesignIdPrefix: string;
  orderDesignIdPrefix: string;
  localDraftDbName: string;
  fallbackStorageKey: string;
  guestTokenStorageKey: string;
  cloudConfigSource: string;
  netlifyPath: string;
  testCartStorageKey: string;
  configStoragePrefix: string;
}

export const GI_PRODUCT_CONFIGS = {
  mens: {
    key: 'mens',
    slug: 'gi',
    stateKind: 'gi',
    productName: 'BJJ Gi',
    productTitle: 'Custom BJJ Gi',
    shopifyProductPath: '/products/customgi',
    shopifyProductHandle: 'customgi',
    shopifyProductUrl: 'https://dspln.com/products/customgi',
    modelUrl: '/models/fixed-sleeev-model-suit-2024.glb',
    designNamePrefix: 'Gi Design',
    savedDesignIdPrefix: 'gi_saved',
    orderDesignIdPrefix: 'gi_order',
    localDraftDbName: 'dspln-gi-configurator',
    fallbackStorageKey: 'dspln:gi-designs:fallback:v1',
    guestTokenStorageKey: 'dspln:gi-cloud-guest-token',
    cloudConfigSource: 'dspln-gi-configurator',
    netlifyPath: '/configurator/gi',
    testCartStorageKey: 'dspln:shopify-test-cart',
    configStoragePrefix: 'dspln:config:',
  },
  kids: {
    key: 'kids',
    slug: 'kids-gi',
    stateKind: 'kids-gi',
    productName: 'Kids BJJ Gi',
    productTitle: 'Kids Custom Gi',
    shopifyProductPath: '/products/custom-kids-gi',
    shopifyProductHandle: 'custom-kids-gi',
    shopifyProductUrl: 'https://dspln.com/products/custom-kids-gi',
    modelUrl: '/models/big-kids-gi-suit-edited-in-blender-5.glb?v=20260602-belt-text-height-2',
    designNamePrefix: 'Kids Gi Design',
    savedDesignIdPrefix: 'kids_gi_saved',
    orderDesignIdPrefix: 'kids_gi_order',
    localDraftDbName: 'dspln-kids-gi-configurator',
    fallbackStorageKey: 'dspln:kids-gi-designs:fallback:v1',
    guestTokenStorageKey: 'dspln:kids-gi-cloud-guest-token',
    cloudConfigSource: 'dspln-kids-gi-configurator',
    netlifyPath: '/configurator/kids-gi',
    testCartStorageKey: 'dspln:kids-gi-shopify-test-cart',
    configStoragePrefix: 'dspln:kids-gi-config:',
  },
  womens: {
    key: 'womens',
    slug: 'womens-gi',
    stateKind: 'womens-gi',
    productName: "Women's BJJ Gi",
    productTitle: "Women's Custom Gi",
    shopifyProductPath: '/products/womens-custom-gi-suit',
    shopifyProductHandle: 'womens-custom-gi-suit',
    shopifyProductUrl: 'https://dspln.com/products/womens-custom-gi-suit',
    modelUrl: '/models/womens-gi-suit-edited-in-blender.glb?v=20260603-clean-model-5',
    designNamePrefix: "Women's Gi Design",
    savedDesignIdPrefix: 'womens_gi_saved',
    orderDesignIdPrefix: 'womens_gi_order',
    localDraftDbName: 'dspln-womens-gi-configurator',
    fallbackStorageKey: 'dspln:womens-gi-designs:fallback:v1',
    guestTokenStorageKey: 'dspln:womens-gi-cloud-guest-token',
    cloudConfigSource: 'dspln-womens-gi-configurator',
    netlifyPath: '/configurator/womens-gi',
    testCartStorageKey: 'dspln:womens-gi-shopify-test-cart',
    configStoragePrefix: 'dspln:womens-gi-config:',
  },
  'mens-kimono': {
    key: 'mens-kimono',
    slug: 'mens-kimono',
    stateKind: 'mens-kimono',
    productName: 'BJJ Kimono',
    productTitle: 'Custom BJJ Kimono',
    shopifyProductPath: '/products/mens-custom-kimono',
    shopifyProductHandle: 'mens-custom-kimono',
    shopifyProductUrl: 'https://dspln.com/products/mens-custom-kimono',
    modelUrl: '/models/fixed-sleeev-model-suit-2024.glb',
    designNamePrefix: 'Kimono Design',
    savedDesignIdPrefix: 'mens_kimono_saved',
    orderDesignIdPrefix: 'mens_kimono_order',
    localDraftDbName: 'dspln-mens-kimono-configurator',
    fallbackStorageKey: 'dspln:mens-kimono-designs:fallback:v1',
    guestTokenStorageKey: 'dspln:mens-kimono-cloud-guest-token',
    cloudConfigSource: 'dspln-mens-kimono-configurator',
    netlifyPath: '/configurator/mens-kimono',
    testCartStorageKey: 'dspln:mens-kimono-shopify-test-cart',
    configStoragePrefix: 'dspln:mens-kimono-config:',
  },
  'mens-belt': {
    key: 'mens-belt',
    slug: 'mens-belt',
    stateKind: 'mens-belt',
    productName: 'BJJ Belt',
    productTitle: 'Custom BJJ Belt',
    shopifyProductPath: '/products/mens-custom-belt',
    shopifyProductHandle: 'mens-custom-belt',
    shopifyProductUrl: 'https://dspln.com/products/mens-custom-belt',
    modelUrl: '/models/fixed-sleeev-model-suit-2024.glb',
    designNamePrefix: 'Belt Design',
    savedDesignIdPrefix: 'mens_belt_saved',
    orderDesignIdPrefix: 'mens_belt_order',
    localDraftDbName: 'dspln-mens-belt-configurator',
    fallbackStorageKey: 'dspln:mens-belt-designs:fallback:v1',
    guestTokenStorageKey: 'dspln:mens-belt-cloud-guest-token',
    cloudConfigSource: 'dspln-mens-belt-configurator',
    netlifyPath: '/configurator/mens-belt',
    testCartStorageKey: 'dspln:mens-belt-shopify-test-cart',
    configStoragePrefix: 'dspln:mens-belt-config:',
  },
  'mens-pant': {
    key: 'mens-pant',
    slug: 'mens-pant',
    stateKind: 'mens-pant',
    productName: 'BJJ Pants',
    productTitle: 'Custom BJJ Pants',
    shopifyProductPath: '/products/mens-custom-pants',
    shopifyProductHandle: 'mens-custom-pants',
    shopifyProductUrl: 'https://dspln.com/products/mens-custom-pants',
    modelUrl: '/models/fixed-sleeev-model-suit-2024.glb',
    designNamePrefix: 'Pants Design',
    savedDesignIdPrefix: 'mens_pant_saved',
    orderDesignIdPrefix: 'mens_pant_order',
    localDraftDbName: 'dspln-mens-pant-configurator',
    fallbackStorageKey: 'dspln:mens-pant-designs:fallback:v1',
    guestTokenStorageKey: 'dspln:mens-pant-cloud-guest-token',
    cloudConfigSource: 'dspln-mens-pant-configurator',
    netlifyPath: '/configurator/mens-pant',
    testCartStorageKey: 'dspln:mens-pant-shopify-test-cart',
    configStoragePrefix: 'dspln:mens-pant-config:',
  },
} satisfies Record<GiProductKey, GiProductConfig>;

export function giProductConfigForSlug(slug: string | null | undefined) {
  const normalizedSlug = slug?.trim();
  return (
    Object.values(GI_PRODUCT_CONFIGS).find(
      (config) => config.slug === normalizedSlug,
    ) ?? GI_PRODUCT_CONFIGS.mens
  );
}

export function currentGiProductConfig() {
  if (typeof window === 'undefined') return GI_PRODUCT_CONFIGS.mens;
  const pathMatch = window.location.pathname.match(/\/configurator\/([^/?#]+)/);
  const querySlug = new URLSearchParams(window.location.search).get('configuratorSlug');
  return giProductConfigForSlug(querySlug ?? pathMatch?.[1]);
}
