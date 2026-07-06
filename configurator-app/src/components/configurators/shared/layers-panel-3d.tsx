import { memo } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';

import type { GiLayer } from '../gi/gi-state';

interface LayersPanel3DProps {
  layers: GiLayer[];
  selectedLayerId: string | null;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onDelete: (id: string) => void;
}

export const LayersPanel3D = memo(
  ({
    layers,
    selectedLayerId,
    onSelect,
    onToggleVisibility,
    onDelete,
  }: LayersPanel3DProps) => {
    return (
      <div className="flex flex-1 flex-col border-t">
        <div className="text-muted-foreground border-b px-4 py-2 text-[11px] font-medium tracking-wider uppercase">
          Layers
        </div>
        {layers.length === 0 ? (
          <div className="text-muted-foreground p-4 text-xs">
            No elements yet
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto p-2">
            {layers
              .slice()
              .reverse()
              .map((layer) => {
                const isActive = layer.id === selectedLayerId;
                return (
                  <li
                    key={layer.id}
                    className={`group mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-foreground'
                        : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <button
                      onClick={() => onSelect(layer.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="border-border h-6 w-6 shrink-0 overflow-hidden rounded border bg-white"
                        style={{
                          backgroundImage: `url(${layer.imageUrl})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                        }}
                        aria-hidden
                      />
                      <span className="truncate">{layer.name}</span>
                    </button>
                    <button
                      onClick={() => onToggleVisibility(layer.id)}
                      className="text-muted-foreground hover:text-foreground p-1"
                      aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                    >
                      {layer.visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => onDelete(layer.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      aria-label="Delete layer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    );
  },
);

LayersPanel3D.displayName = 'LayersPanel3D';
