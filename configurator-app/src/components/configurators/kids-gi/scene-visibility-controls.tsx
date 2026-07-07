import { memo } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { GI_PART_DISPLAY, type GiPart } from './gi-config';
import { useGiState } from './gi-state';

const CONTROLS: GiPart[] = ['jacket', 'belt', 'pants'];

export const SceneVisibilityControls = memo(() => {
  const {
    partVisibility,
    scenePartVisibility,
    setScenePartVisible,
  } = useGiState();

  return (
    <div className="absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/60 bg-white/45 p-1.5 shadow-lg backdrop-blur-md lg:flex">
      {CONTROLS.map((part) => {
        const isIncluded = partVisibility[part];
        const isVisible = scenePartVisibility[part];
        const label = `${isVisible ? 'Hide' : 'Show'} ${GI_PART_DISPLAY[part]}`;
        const Icon = isVisible ? EyeOff : Eye;

        return (
          <button
            key={part}
            type="button"
            onClick={() => setScenePartVisible(part, !isVisible)}
            disabled={!isIncluded}
            className={`flex h-9 min-w-[5.6rem] items-center justify-center gap-1.5 rounded-full border px-3 text-[10px] font-semibold tracking-[0.08em] uppercase transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
              isVisible
                ? 'border-white/70 bg-white/70 text-foreground shadow-sm hover:bg-white/90'
                : 'border-white/35 bg-black/20 text-foreground/55 hover:bg-black/25'
            }`}
            aria-pressed={!isVisible}
            title={label}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{GI_PART_DISPLAY[part]}</span>
          </button>
        );
      })}
    </div>
  );
});

SceneVisibilityControls.displayName = 'SceneVisibilityControls';
