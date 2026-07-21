import { memo } from 'react';

import { useGiState } from '../gi-state';
import {
  PANT_LOGO_SLOT_CAMERA_VIEW,
  PANT_LOGO_SLOT_LABEL,
  PANT_LOGO_SLOTS,
  PANT_SUBPART_CAMERA_VIEW,
  PANT_SUBPART_LABEL,
  PANT_SUBPARTS,
} from '../gi-config';
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
    setCameraView,
  } = useGiState();
  return (
    <div className="flex flex-col">
      {/* Not purchased → no customization options (same rule as cart + tech
          pack). Add the part back to customize it. */}
      <>
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
          onChange={(hex) => {
            setPantSubColor(sub, hex);
            setCameraView(PANT_SUBPART_CAMERA_VIEW[sub]);
          }}
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
            onUpload={(file, dim) => {
              setPantLogo(slot, {
                imageUrl: URL.createObjectURL(file),
                imageWidth: dim.width,
                imageHeight: dim.height,
                filename: file.name,
                file,
              });
              setCameraView(PANT_LOGO_SLOT_CAMERA_VIEW[slot]);
            }}
            onRemove={() => removePantLogo(slot)}
            onActivate={() => setCameraView(PANT_LOGO_SLOT_CAMERA_VIEW[slot])}
          />
        );
      })}
      </>
    </div>
  );
});

PantSections.displayName = 'PantSections';
