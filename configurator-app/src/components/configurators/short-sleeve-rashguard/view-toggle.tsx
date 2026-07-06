import { memo } from 'react';
import { Button } from '@/components/ui/button';

import type { CameraView } from './rashguard-config';
import { useRashguardState } from './rashguard-state';

const VIEWS: CameraView[] = ['front', 'back'];

export const RashguardViewToggle = memo(() => {
  const { cameraView, setCameraView } = useRashguardState();

  return (
    <div className="absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 gap-1 rounded-lg border bg-white/90 p-1 shadow-sm backdrop-blur-sm lg:flex">
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

RashguardViewToggle.displayName = 'RashguardViewToggle';
