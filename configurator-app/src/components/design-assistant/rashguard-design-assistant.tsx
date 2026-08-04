import { useCallback, type ComponentProps } from 'react';

import {
  DesignAssistant,
  type AssistantProductContext,
  type AttachedArtwork,
} from './design-assistant';

interface RashguardArtworkLayerLike {
  id: string;
  filename: string;
  imageUrl?: string;
  imageWidth: number;
  imageHeight: number;
  file?: File;
  target: string;
}

interface RashguardStateLike {
  size: string;
  partColors: Record<string, string>;
  artworkLayers: RashguardArtworkLayerLike[];
  setSize: (size: string) => void;
  setPartColor: (part: string, color: string) => void;
  addArtworkLayer: (input: {
    file: File;
    dimensions: { width: number; height: number };
    target?: string;
  }) => void;
  updateArtworkLayer: (
    id: string,
    updates: { target?: string },
  ) => void;
  removeArtworkLayer: (id: string) => void;
  setCameraView: (view: 'front' | 'back') => void;
}

export interface RashguardAssistantConfig {
  id: string;
  name: string;
  parts: string[];
  artworkTargets: string[];
  colorHexByName: Record<string, string>;
  colorNameByHex: Record<string, string>;
  audience?: 'adult' | 'women' | 'kids';
}

interface RashguardDesignAssistantProps {
  placement: NonNullable<ComponentProps<typeof DesignAssistant>['placement']>;
  useProductState: () => unknown;
  config: RashguardAssistantConfig;
}

const placementTarget = (raw: unknown) => String(raw ?? '').replace(/^rashguard:/, '');

const normalizeHexColor = (raw: string) => {
  const value = raw.trim();
  const shortMatch = value.match(/^#?([0-9a-f]{3})$/i);
  if (shortMatch) {
    const [red, green, blue] = shortMatch[1].split('');
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }
  const fullMatch = value.match(/^#?([0-9a-f]{6})$/i);
  return fullMatch ? `#${fullMatch[1].toLowerCase()}` : null;
};

const artworkToFile = async (artwork: AttachedArtwork) => {
  const response = await fetch(artwork.url);
  if (!response.ok) throw new Error('Could not retrieve artwork');
  const blob = await response.blob();
  return new File([blob], artwork.filename || 'artwork.png', {
    type: blob.type || 'image/png',
  });
};

const layerToFile = async (layer: RashguardArtworkLayerLike) => {
  if (layer.file) return layer.file;
  if (!layer.imageUrl) throw new Error('Artwork image is unavailable');
  const response = await fetch(layer.imageUrl);
  if (!response.ok) throw new Error('Could not retrieve existing artwork');
  const blob = await response.blob();
  return new File([blob], layer.filename || 'artwork.png', {
    type: blob.type || 'image/png',
  });
};

export function RashguardDesignAssistant({
  placement,
  useProductState,
  config,
}: RashguardDesignAssistantProps) {
  const state = useProductState() as RashguardStateLike;
  const context: AssistantProductContext = {
    id: config.id,
    name: config.name,
    family: 'rashguard',
    allowedParts: config.parts,
    colorTargets: config.parts.map((part) => `rashguard:${part}`),
    artworkTargets: config.artworkTargets.map((target) => `rashguard:${target}`),
    supportsBeltText: false,
    audience: config.audience ?? 'adult',
    colorMode: 'any-hex',
    colorOptionsByTarget: Object.fromEntries(
      config.parts.map((part) => [
        `rashguard:${part}`,
        Object.entries(config.colorNameByHex).map(
          ([hex, name]) => `${name} (${hex})`,
        ),
      ]),
    ),
  };

  const runProductTool = useCallback(
    async (
      name: string,
      input: Record<string, unknown>,
      helpers: { getArtwork: (id: string) => AttachedArtwork | undefined },
    ): Promise<string | null> => {
      if (name === 'get_design') {
        return JSON.stringify({
          product: config.name,
          colorMode: 'any-hex',
          colorRule:
            'Every panel accepts any six-digit hex color. Described colors should be converted to a reasonable #RRGGBB value.',
          suggestedColors: Object.entries(config.colorNameByHex).map(
            ([hex, name]) => ({ name, hex }),
          ),
          size: state.size || null,
          colors: Object.fromEntries(
            Object.entries(state.partColors).map(([part, hex]) => [
              part,
              config.colorNameByHex[hex.toLowerCase()] ?? hex,
            ]),
          ),
          artworkPlacements: state.artworkLayers.map((layer) => ({
            id: layer.id,
            target: `rashguard:${layer.target}`,
            filename: layer.filename,
          })),
        });
      }

      if (name === 'set_panel_color') {
        const target = placementTarget(input.target);
        const colorName = String(input.color ?? '');
        const color =
          normalizeHexColor(colorName) ??
          config.colorHexByName[colorName.trim().toLowerCase()];
        if (!config.parts.includes(target)) {
          return JSON.stringify({ ok: false, error: `${target} is not an available panel.` });
        }
        if (!color) {
          return JSON.stringify({
            ok: false,
            error: `${colorName} is not a valid color. Use a six-digit hex value such as #9caf88.`,
          });
        }
        state.setPartColor(target, color);
        return JSON.stringify({ ok: true });
      }

      if (name === 'set_sizes') {
        const size = String(input.size ?? '');
        if (!size) return JSON.stringify({ ok: false, error: 'A size is required.' });
        state.setSize(size);
        return JSON.stringify({ ok: true, size });
      }

      if (name === 'focus_camera') {
        const view = input.view === 'back' ? 'back' : 'front';
        state.setCameraView(view);
        return JSON.stringify({ ok: true, view });
      }

      if (name === 'apply_uploaded_artwork') {
        const target = placementTarget(input.target);
        const artwork = helpers.getArtwork(String(input.artworkId ?? ''));
        if (!config.artworkTargets.includes(target)) {
          return JSON.stringify({ ok: false, error: `${target} is not an available artwork area.` });
        }
        if (!artwork) {
          return JSON.stringify({ ok: false, error: 'Uploaded artwork not found.' });
        }
        try {
          const file = await artworkToFile(artwork);
          state.addArtworkLayer({
            file,
            dimensions: { width: artwork.width, height: artwork.height },
            target,
          });
          state.setCameraView(target.toLowerCase().includes('back') ? 'back' : 'front');
          return JSON.stringify({ ok: true, appliedTo: `rashguard:${target}` });
        } catch (error) {
          return JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Artwork could not be applied.',
          });
        }
      }

      if (name === 'manage_existing_artwork') {
        const action = String(input.action ?? '');
        const source = placementTarget(input.source);
        const target = placementTarget(input.target);
        const layer = [...state.artworkLayers]
          .reverse()
          .find((candidate) => candidate.target === source);
        if (!layer) {
          return JSON.stringify({ ok: false, error: `No artwork is placed at ${source}.` });
        }
        if (action === 'remove') {
          state.removeArtworkLayer(layer.id);
          return JSON.stringify({ ok: true, action, source: `rashguard:${source}` });
        }
        if (!config.artworkTargets.includes(target) || target === source) {
          return JSON.stringify({ ok: false, error: 'Choose a different available artwork target.' });
        }
        if (action === 'move') {
          state.updateArtworkLayer(layer.id, { target });
          state.setCameraView(target.toLowerCase().includes('back') ? 'back' : 'front');
          return JSON.stringify({ ok: true, action, source, target });
        }
        if (action === 'copy') {
          try {
            const file = await layerToFile(layer);
            state.addArtworkLayer({
              file,
              dimensions: { width: layer.imageWidth, height: layer.imageHeight },
              target,
            });
            state.setCameraView(target.toLowerCase().includes('back') ? 'back' : 'front');
            return JSON.stringify({ ok: true, action, source, target });
          } catch (error) {
            return JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'Artwork could not be copied.',
            });
          }
        }
        return JSON.stringify({ ok: false, error: 'Action must be move, copy, or remove.' });
      }

      if (['set_part_included', 'set_belt_text'].includes(name)) {
        return JSON.stringify({ ok: false, error: `${name} is not available on ${config.name}.` });
      }

      // Image generation and editing remain in the shared assistant core.
      return null;
    },
    [config, state],
  );

  return (
    <DesignAssistant
      placement={placement}
      useProductState={useProductState}
      productContext={context}
      runProductTool={runProductTool}
    />
  );
}
