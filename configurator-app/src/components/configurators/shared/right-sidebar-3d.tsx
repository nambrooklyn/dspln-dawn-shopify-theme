import { memo } from 'react';

import { useGiState } from '../gi/gi-state';
import { AttributesPanel3D } from './attributes-panel-3d';
import { LayersPanel3D } from './layers-panel-3d';

/**
 * Right sidebar for the 3D configurator. Mirrors the visual structure of
 * the 2D editor's RightSidebar but consumes our gi-state types (not Fabric).
 */
export const RightSidebar3D = memo(() => {
  const {
    layers,
    selectedLayerId,
    selectLayer,
    updateLayer,
    removeLayer,
    toggleLayerVisibility,
  } = useGiState();

  const selectedLayer =
    layers.find((layer) => layer.id === selectedLayerId) ?? null;

  return (
    <div className="bg-background flex h-full w-72 shrink-0 flex-col border-l">
      <AttributesPanel3D
        selectedLayer={selectedLayer}
        onUpdate={(patch) => {
          if (selectedLayerId) updateLayer(selectedLayerId, patch);
        }}
      />
      <LayersPanel3D
        layers={layers}
        selectedLayerId={selectedLayerId}
        onSelect={selectLayer}
        onToggleVisibility={toggleLayerVisibility}
        onDelete={removeLayer}
      />
    </div>
  );
});

RightSidebar3D.displayName = 'RightSidebar3D';
