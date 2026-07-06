import { memo } from 'react';

import { useGiState } from '../../gi/gi-state';
import {
  PANT_LOGO_SLOT_LABEL,
  PANT_LOGO_SLOTS,
  PANT_SUBPART_LABEL,
  PANT_SUBPARTS,
} from '../../gi/gi-config';
import { SectionAddRemove } from './section-add-remove';
import { SectionColorSwatches } from './section-color-swatches';
import { SectionLogoUpload } from './section-logo-upload';
import { SectionSizeSelect } from './section-size-select';

/**
 * Pant customization sections. Mirrors the D2C reference once Nam
 * confirms each section.
 */
export const PantSections = memo(() => {
  const {
    partVisibility,
    setPartVisible,
    pantSize,
    setPantSize,
    pantSubColors,
    setPantSubColor,
    pantLogos,
    setPantLogo,
    removePantLogo,
  } = useGiState();
  return (
    <div className="flex flex-col">
      <SectionAddRemove
        description="Pant is made of 12oz Cotton Canvas fabric."
        addLabel="Add Pant +$45"
        removeLabel="Remove Pant"
        included={partVisibility.pants}
        onAdd={() => setPartVisible('pants', true)}
        onRemove={() => setPartVisible('pants', false)}
      />
      <SectionSizeSelect
        title="Pant Size"
        value={pantSize}
        onChange={setPantSize}
      />
      {PANT_SUBPARTS.map((sub) => (
        <SectionColorSwatches
          key={sub}
          title={PANT_SUBPART_LABEL[sub]}
          value={pantSubColors[sub]}
          onChange={(hex) => setPantSubColor(sub, hex)}
        />
      ))}
      {PANT_LOGO_SLOTS.map((slot) => {
        const logo = pantLogos[slot];
        return (
          <SectionLogoUpload
            key={slot}
            title={PANT_LOGO_SLOT_LABEL[slot]}
            priceLabel="+$10"
            imageUrl={logo?.imageUrl}
            filename={logo?.filename}
            onUpload={(file, dim) =>
              setPantLogo(slot, {
                imageUrl: URL.createObjectURL(file),
                imageWidth: dim.width,
                imageHeight: dim.height,
                filename: file.name,
                file,
              })
            }
            onRemove={() => removePantLogo(slot)}
          />
        );
      })}
    </div>
  );
});

PantSections.displayName = 'PantSections';
