import { memo } from 'react';

import { useGiState } from '../gi-state';
import {
  KIMONO_LOGO_SLOT_CAMERA_VIEW,
  KIMONO_LOGO_SLOT_LABEL,
  KIMONO_LOGO_SLOTS,
  KIMONO_SUBPART_CAMERA_VIEW,
  KIMONO_SUBPART_LABEL,
  KIMONO_SUBPARTS,
} from '../gi-config';
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
};

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
    setCameraView,
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

      {/* Not purchased → no customization options (same rule as cart + tech
          pack). Add the part back to customize it. */}
      {!partVisibility.jacket ? (
        <p className="text-muted-foreground px-3 py-4 text-[11px] tracking-wide uppercase">
          Kimono removed — add it back to customize.
        </p>
      ) : (
        <>
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
          onChange={(hex) => {
            setKimonoSubColor(sub, hex);
            setCameraView(KIMONO_SUBPART_CAMERA_VIEW[sub]);
          }}
        />
      ))}

      {/* SECTIONS 7–10 — Logo uploads for fixed anchor positions on
          the kimono. Each slot is independent (own upload + remove). */}
      {KIMONO_LOGO_SLOTS.map((slot) => {
        const logo = kimonoLogos[slot];
        return (
          <SectionLogoUpload
            key={slot}
            title={KIMONO_LOGO_SLOT_LABEL[slot]}
            priceLabel={KIMONO_LOGO_PRICE_LABEL[slot]}
            imageUrl={logo?.imageUrl}
            filename={logo?.filename}
            onUpload={(file, dim) => {
              setKimonoLogo(slot, {
                imageUrl: URL.createObjectURL(file),
                imageWidth: dim.width,
                imageHeight: dim.height,
                filename: file.name,
                file,
              });
              setCameraView(KIMONO_LOGO_SLOT_CAMERA_VIEW[slot]);
            }}
            onRemove={() => removeKimonoLogo(slot)}
            onActivate={() => setCameraView(KIMONO_LOGO_SLOT_CAMERA_VIEW[slot])}
          />
        );
      })}
        </>
      )}
    </div>
  );
});

KimonoSections.displayName = 'KimonoSections';
