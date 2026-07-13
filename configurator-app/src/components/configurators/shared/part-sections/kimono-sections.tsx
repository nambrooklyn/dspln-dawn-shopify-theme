import { memo } from 'react';

import { useGiState } from '../../gi/gi-state';
import {
  KIMONO_LOGO_SLOT_LABEL,
  KIMONO_LOGO_SLOTS,
  KIMONO_SUBPART_LABEL,
  KIMONO_SUBPARTS,
  STUDIO_ONLY_KIMONO_LOGO_SLOTS,
} from '../../gi/gi-config';
import { isStudioMode } from '../studio-mode';
import { SectionAddRemove } from './section-add-remove';
import { SectionColorSwatches } from './section-color-swatches';
import { SectionKimonoSize } from './section-kimono-size';
import { SectionLogoUpload } from './section-logo-upload';

const KIMONO_LOGO_PRICE_LABEL: Record<
  (typeof KIMONO_LOGO_SLOTS)[number],
  string
> = {
  'left-chest': '+$10',
  'left-sleeve': '+$10',
  'right-sleeve': '+$10',
  back: '+$25',
  'back-skirt': '+$25',
};

// Studio-only slots never show their upload section to customers; the
// artwork itself still renders for anyone viewing a shared design.
const VISIBLE_KIMONO_LOGO_SLOTS = KIMONO_LOGO_SLOTS.filter(
  (slot) => isStudioMode() || !STUDIO_ONLY_KIMONO_LOGO_SLOTS.includes(slot),
);

/**
 * All Kimono customization sections, in the order they appear on the
 * D2C reference (dspln.com/products/customgi). We grow this file
 * section-by-section as Nam confirms each one.
 */
export const KimonoSections = memo(() => {
  const {
    partVisibility,
    setPartVisible,
    kimonoSubColors,
    setKimonoSubColor,
    kimonoLogos,
    setKimonoLogo,
    removeKimonoLogo,
  } = useGiState();
  return (
    <div className="flex flex-col">
      {/* SECTION 1 — Intro + Add/Remove Kimono */}
      <SectionAddRemove
        description="Kimono is made of 350gsm Pearl Weave fabric."
        addLabel="Add Kimono +$55"
        removeLabel="Remove Kimono"
        included={partVisibility.jacket}
        onAdd={() => setPartVisible('jacket', true)}
        onRemove={() => setPartVisible('jacket', false)}
      />

      {/* SECTION 2 — Kimono Size dropdown */}
      <SectionKimonoSize />

      {/* SECTIONS 3–6 — Per-sub-part color pickers (body, lapel,
          reinforcement, stitching), in the order they appear on the
          D2C reference. */}
      {KIMONO_SUBPARTS.map((sub) => (
        <SectionColorSwatches
          key={sub}
          title={KIMONO_SUBPART_LABEL[sub]}
          value={kimonoSubColors[sub]}
          onChange={(hex) => setKimonoSubColor(sub, hex)}
        />
      ))}

      {/* SECTIONS 7–10 — Logo uploads for fixed anchor positions on
          the kimono. Each slot is independent (own upload + remove). */}
      {VISIBLE_KIMONO_LOGO_SLOTS.map((slot) => {
        const logo = kimonoLogos[slot];
        return (
          <SectionLogoUpload
            key={slot}
            title={KIMONO_LOGO_SLOT_LABEL[slot]}
            priceLabel={KIMONO_LOGO_PRICE_LABEL[slot]}
            imageUrl={logo?.imageUrl}
            filename={logo?.filename}
            onUpload={(file, dim) =>
              setKimonoLogo(slot, {
                imageUrl: URL.createObjectURL(file),
                imageWidth: dim.width,
                imageHeight: dim.height,
                filename: file.name,
                file,
              })
            }
            onRemove={() => removeKimonoLogo(slot)}
          />
        );
      })}
    </div>
  );
});

KimonoSections.displayName = 'KimonoSections';
