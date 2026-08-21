import { memo } from 'react';

import {
  BELT_COLOR_SWATCHES,
  GI_COLOR_SWATCHES,
  KIMONO_SUBPART_LABEL,
  PANT_SUBPART_LABEL,
} from '../womens-gi/gi-config';
import { useGiState } from '../womens-gi/gi-state';
import type { GiV2Anchor } from './anchors';
import {
  GiV2BeltEndPanel,
  GiV2ColorPanel,
  GiV2LogoPanel,
} from './v2-panels';

/**
 * Maps an active hotspot anchor to its floating panel — shared by the v3
 * and v4 shells (v2 keeps its own inline copy so it stays frozen for
 * comparison).
 */
export const GiAnchorPanel = memo(
  ({ anchor, onClose }: { anchor: GiV2Anchor; onClose: () => void }) => {
    const {
      partColors,
      setPartColor,
      kimonoSubColors,
      setKimonoSubColor,
      pantSubColors,
      setPantSubColor,
      kimonoLogos,
      setKimonoLogo,
      removeKimonoLogo,
      pantLogos,
      setPantLogo,
      removePantLogo,
    } = useGiState();

    switch (anchor.kind) {
      case 'kimono-color':
        return (
          <GiV2ColorPanel
            title={KIMONO_SUBPART_LABEL[anchor.sub]}
            value={kimonoSubColors[anchor.sub]}
            swatches={GI_COLOR_SWATCHES}
            onChange={(hex) => setKimonoSubColor(anchor.sub, hex)}
            onClose={onClose}
          />
        );
      case 'pant-color':
        return (
          <GiV2ColorPanel
            title={PANT_SUBPART_LABEL[anchor.sub]}
            value={pantSubColors[anchor.sub]}
            swatches={GI_COLOR_SWATCHES}
            onChange={(hex) => setPantSubColor(anchor.sub, hex)}
            onClose={onClose}
          />
        );
      case 'belt-color':
        return (
          <GiV2ColorPanel
            title="Belt Color"
            value={partColors.belt}
            swatches={BELT_COLOR_SWATCHES}
            onChange={(hex) => setPartColor('belt', hex)}
            onClose={onClose}
          />
        );
      case 'belt-end':
        return <GiV2BeltEndPanel end={anchor.end} onClose={onClose} />;
      case 'kimono-logo': {
        const logo = kimonoLogos[anchor.slot];
        return (
          <GiV2LogoPanel
            label={anchor.label}
            imageUrl={logo?.imageUrl}
            filename={logo?.filename}
            onUpload={(file, dimensions) => {
              setKimonoLogo(anchor.slot, {
                imageUrl: URL.createObjectURL(file),
                imageWidth: dimensions.width,
                imageHeight: dimensions.height,
                filename: file.name,
                file,
              });
            }}
            onApplyExisting={(item) => {
              setKimonoLogo(anchor.slot, {
                imageUrl: item.url,
                imageWidth: item.imageWidth,
                imageHeight: item.imageHeight,
                filename: item.filename,
              });
            }}
            onRemove={() => removeKimonoLogo(anchor.slot)}
            onClose={onClose}
          />
        );
      }
      case 'pant-logo': {
        const logo = pantLogos[anchor.slot];
        return (
          <GiV2LogoPanel
            label={anchor.label}
            imageUrl={logo?.imageUrl}
            filename={logo?.filename}
            onUpload={(file, dimensions) => {
              setPantLogo(anchor.slot, {
                imageUrl: URL.createObjectURL(file),
                imageWidth: dimensions.width,
                imageHeight: dimensions.height,
                filename: file.name,
                file,
              });
            }}
            onApplyExisting={(item) => {
              setPantLogo(anchor.slot, {
                imageUrl: item.url,
                imageWidth: item.imageWidth,
                imageHeight: item.imageHeight,
                filename: item.filename,
              });
            }}
            onRemove={() => removePantLogo(anchor.slot)}
            onClose={onClose}
          />
        );
      }
      default:
        return null;
    }
  },
);
GiAnchorPanel.displayName = 'GiAnchorPanel';
