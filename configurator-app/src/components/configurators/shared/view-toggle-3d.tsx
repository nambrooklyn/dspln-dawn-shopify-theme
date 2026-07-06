import { memo } from 'react';
import { Button } from '@/components/ui/button';

import { useGiState } from '../gi/gi-state';
import type { CameraView } from '../gi/gi-config';

const VIEWS: CameraView[] = ['front', 'back'];

export const ViewToggle3D = memo(() => {
  const { cameraView, setCameraView } = useGiState();
  return (
    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-lg border bg-white/90 p-1 shadow-sm backdrop-blur-sm">
      {VIEWS.map((view) => (
        <Button
          key={view}
          variant={cameraView === view ? 'default' : 'ghost'}
          size="sm"
          className="h-8 px-5 text-xs font-medium capitalize"
          onClick={() => setCameraView(view)}
        >
          {view}
        </Button>
      ))}
    </div>
  );
});

ViewToggle3D.displayName = 'ViewToggle3D';
