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
  const missingParts: string[] = [];
  if (spec.partVisibility.jacket && !spec.kimono.size?.trim()) {
    missingParts.push('kimono');
  }
  if (spec.partVisibility.belt && !spec.belt.size?.trim()) {
    missingParts.push('belt');
  }
  if (spec.partVisibility.pants && !spec.pant.size?.trim()) {
    missingParts.push('pant');
  }
  if (missingParts.length === 1) {
    return `Please choose a ${missingParts[0]} size before adding this Gi to cart.`;
  }
  if (missingParts.length > 1) {
    const labels = missingParts.map((part) => `${part} size`);
    const list =
      labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
        : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
    return `Please choose a ${list} before adding this Gi to cart.`;
  }
  return null;
}
