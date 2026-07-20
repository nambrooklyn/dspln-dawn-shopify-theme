import { memo, useEffect, useMemo, useState } from 'react';

import { useGiState } from './gi-state';
import {
  CAMERA_POSITIONS,
  KIMONO_LOGO_SLOT_CAMERA_VIEW,
  KIMONO_SUBPART_CAMERA_VIEW,
  PANT_LOGO_SLOT_CAMERA_VIEW,
  PANT_SUBPART_CAMERA_VIEW,
  PART_CAMERA_VIEW,
  type CameraView,
} from './gi-config';
import { copyTextToClipboard } from '../shared/studio-mode';

/**
 * Studio-only camera tuner (?studio=1). Workflow:
 *
 *   1. Pick a view — the camera tweens to its current preset.
 *   2. Orbit / zoom by hand until the framing looks right.
 *   3. COPY — the exact gi-config.ts lines (position + target) land on
 *      the clipboard, and stay visible in the panel as a fallback.
 *
 * Values are read live from the same camera + OrbitControls instances the
 * canvas uses (window.__giCamera / __giControls), so what you copy is
 * exactly what you see.
 */

const round = (n: number) => Math.round(n * 100) / 100;

/** Which customization options currently use each view (hint line). */
const buildUsageIndex = (): Record<string, string[]> => {
  const usage: Record<string, string[]> = {};
  const add = (view: CameraView, label: string) => {
    (usage[view] ??= []).push(label);
  };
  Object.entries(PART_CAMERA_VIEW).forEach(([k, v]) => add(v, `tab:${k}`));
  Object.entries(KIMONO_SUBPART_CAMERA_VIEW).forEach(([k, v]) => add(v, `kimono:${k}`));
  Object.entries(KIMONO_LOGO_SLOT_CAMERA_VIEW).forEach(([k, v]) => add(v, `logo:${k}`));
  Object.entries(PANT_SUBPART_CAMERA_VIEW).forEach(([k, v]) => add(v, `pant:${k}`));
  Object.entries(PANT_LOGO_SLOT_CAMERA_VIEW).forEach(([k, v]) => add(v, `logo:${k}`));
  return usage;
};

type Vec3 = { x: number; y: number; z: number };

export const CameraTuner = memo(() => {
  const { cameraView, setCameraView } = useGiState();
  const [live, setLive] = useState<{ pos: Vec3; tgt: Vec3 } | null>(null);
  const [copied, setCopied] = useState(false);
  const usage = useMemo(buildUsageIndex, []);
  const views = useMemo(
    () => Object.keys(CAMERA_POSITIONS) as CameraView[],
    [],
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      const g = window as unknown as {
        __giCamera?: { position: Vec3 };
        __giControls?: { target: Vec3 };
      };
      if (g.__giCamera && g.__giControls) {
        const { x, y, z } = g.__giCamera.position;
        const t = g.__giControls.target;
        setLive({ pos: { x, y, z }, tgt: { x: t.x, y: t.y, z: t.z } });
      }
    }, 150);
    return () => window.clearInterval(id);
  }, []);

  const posLine = live
    ? `'${cameraView}': [${round(live.pos.x)}, ${round(live.pos.y)}, ${round(live.pos.z)}],`
    : '…';
  const tgtLine = live
    ? `'${cameraView}': [${round(live.tgt.x)}, ${round(live.tgt.y)}, ${round(live.tgt.z)}],`
    : '…';

  const copy = async () => {
    const text = [
      `// ${cameraView} — CAMERA_POSITIONS (desktop + mobile):`,
      posLine,
      `// ${cameraView} — CAMERA_TARGETS:`,
      tgtLine,
    ].join('\n');
    const ok = await copyTextToClipboard(text);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border-border bg-background flex flex-col gap-2 border-b p-3 font-mono text-[10px]">
      <div className="text-foreground text-[11px] font-semibold tracking-wide uppercase">
        Camera tuner
      </div>
      <select
        value={cameraView}
        onChange={(e) => setCameraView(e.target.value as CameraView)}
        className="border-border bg-background text-foreground h-7 w-full rounded border px-1 text-[11px]"
      >
        {views.map((view) => (
          <option key={view} value={view}>
            {view}
          </option>
        ))}
      </select>
      {usage[cameraView] ? (
        <div className="text-muted-foreground leading-snug">
          used by: {usage[cameraView].join(', ')}
        </div>
      ) : (
        <div className="text-muted-foreground">not mapped to an option</div>
      )}
      <div className="text-muted-foreground select-all leading-snug break-all">
        pos {posLine}
        <br />
        tgt {tgtLine}
      </div>
      <button
        type="button"
        onClick={copy}
        className="border-border text-foreground hover:bg-muted h-7 rounded border text-[10px] font-semibold tracking-wide uppercase"
      >
        {copied ? 'Copied ✓' : 'Copy config for this view'}
      </button>
    </div>
  );
});

CameraTuner.displayName = 'CameraTuner';
