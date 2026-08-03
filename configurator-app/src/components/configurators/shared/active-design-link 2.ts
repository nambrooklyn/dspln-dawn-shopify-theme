/**
 * Persistent link between the configurator session and the customer's
 * active saved design.
 *
 * Without this, a page reload loses track of which saved design is being
 * edited, so every subsequent "Save" creates a brand-new record instead of
 * updating the existing one. The link also carries a content signature of
 * the design at its last explicit save, which powers the Saved/Update
 * button state (no signature match = unsaved changes).
 */

export interface ActiveDesignLink {
  id: string;
  name: string;
  signature: string | null;
}

export function readActiveDesignLink(
  storageKey: string,
): ActiveDesignLink | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveDesignLink> | null;
    if (!parsed || typeof parsed.id !== 'string' || !parsed.id) return null;
    return {
      id: parsed.id,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      signature: typeof parsed.signature === 'string' ? parsed.signature : null,
    };
  } catch {
    return null;
  }
}

export function writeActiveDesignLink(
  storageKey: string,
  link: ActiveDesignLink | null,
) {
  if (typeof window === 'undefined') return;
  try {
    if (link) {
      window.localStorage.setItem(storageKey, JSON.stringify(link));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Storage may be unavailable (private mode, quota); the link is a
    // convenience, so saving still works without it.
  }
}

interface SignableLogo {
  filename: string;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Stable identity for a set of placed logos. Deliberately excludes
 * `imageUrl`: object URLs are regenerated on every page load, so including
 * them would make every reload look like an unsaved change.
 */
export function logoSetSignature(
  logos: Partial<Record<string, SignableLogo | null>> | undefined,
) {
  return Object.entries(logos ?? {})
    .filter((entry): entry is [string, SignableLogo] => Boolean(entry[1]))
    .map(
      ([slot, logo]) =>
        `${slot}:${logo.filename}|${logo.imageWidth}x${logo.imageHeight}`,
    )
    .sort()
    .join(',');
}
