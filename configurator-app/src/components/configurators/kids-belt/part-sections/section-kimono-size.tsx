import { memo } from 'react';

import { useGiState } from '../gi-state';
import { SectionSizeSelect } from './section-size-select';

/**
 * Kimono Size section. Matches the D2C reference: title with the current
 * selection labeled on the right, paragraph copy with the size-guide
 * link, then the visual size picker.
 */
export const SectionKimonoSize = memo(() => {
  const { kimonoSize, setKimonoSize } = useGiState();

  return (
    <SectionSizeSelect
      title="Kimono Size"
      value={kimonoSize}
      onChange={setKimonoSize}
    />
  );
});

SectionKimonoSize.displayName = 'SectionKimonoSize';
