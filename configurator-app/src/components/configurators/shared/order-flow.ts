export function createLineDesignId(prefix: string) {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export function productionTechPackUrl(productionUrl?: string) {
  if (!productionUrl) return undefined;
  const url = new URL(productionUrl);
  url.searchParams.set('view', 'tech-pack');
  return url.toString();
}

export function getMissingGiSizeMessage(spec: {
  partVisibility: { jacket?: boolean; belt?: boolean; pants?: boolean };
  kimono: { size?: string };
  belt: { size?: string };
  pant: { size?: string };
}) {
  if (spec.partVisibility.jacket && !spec.kimono.size?.trim()) {
    return 'Please choose a kimono size before adding this Gi to cart.';
  }
  if (spec.partVisibility.belt && !spec.belt.size?.trim()) {
    return 'Please choose a belt size before adding this Gi to cart.';
  }
  if (spec.partVisibility.pants && !spec.pant.size?.trim()) {
    return 'Please choose a pant size before adding this Gi to cart.';
  }
  return null;
}
