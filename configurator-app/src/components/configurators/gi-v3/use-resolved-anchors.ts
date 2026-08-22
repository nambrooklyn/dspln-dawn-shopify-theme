import { useMemo } from 'react';

import { useGiState } from '../gi/gi-state';
import { GI_V2_ANCHORS, type GiV2Anchor } from '../gi-v2/anchors';

/**
 * GI_V2_ANCHORS with the kimono logo slots moved to the REAL anchor
 * positions. The gi model auto-scales on load and the state publishes
 * `computedKimonoAnchors` from the actual mesh bounds — the same source the
 * v1 decal projection uses (`computedKimonoAnchors ?? cfg.position` in
 * gi-canvas). Without this the fabric squares float off the garment, since
 * the static config anchors only match the pre-scale model.
 */
export function useResolvedGiAnchors(): GiV2Anchor[] {
  const { computedKimonoAnchors } = useGiState();

  return useMemo(
    () =>
      GI_V2_ANCHORS.map((anchor) => {
        if (anchor.kind !== 'kimono-logo') return anchor;
        const computed = computedKimonoAnchors?.[anchor.slot];
        if (!computed) return anchor;
        return {
          ...anchor,
          position: computed,
          plane: anchor.plane
            ? { ...anchor.plane, position: computed }
            : undefined,
        };
      }),
    [computedKimonoAnchors],
  );
}
