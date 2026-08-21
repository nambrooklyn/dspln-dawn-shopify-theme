import { memo, useEffect, useState } from 'react';

import { useRashguardState } from './rashguard-state';
import {
  PART_CAMERA_PRESETS,
  RASHGUARD_PARTS,
  RASHGUARD_PART_LABELS,
  type RashguardPart,
} from './rashguard-config';
import { copyTextToClipboard } from '../shared/studio-mode';

/**
 * Studio-only camera tuner (?edit=admin). Workflow:
 *
 *   1. Pick a part — the camera moves to its current framing (its recorded
 *      preset, or the plain front/back view if it has none yet).
 *   2. Orbit / zoom by hand until the framing looks right.
 *   3. COPY — the exact PART_CAMERA_PRESETS line lands on the clipboard, and
 *      stays visible in the panel as a fallback if the clipboard is blocked.
 *   4. Paste it into PART_CAMERA_PRESETS in rashguard-config.ts.
 *
 * Values are read live from the same camera + OrbitControls the canvas uses
 * (window.__rashguardCamera / __rashguardControls), so what you copy is exactly
 * what you see. Modelled on the kids-pant tuner.
 */

const round = (n: number) => Math.round(n * 100) / 100;

type Vec3 = { x: number; y: number; z: number };

export const RashguardCameraTuner = memo(() => {
  const { focusPart } = useRashguardState();
  const [part, setPart] = useState<RashguardPart>(RASHGUARD_PARTS[0]);
  const [live, setLive] = useState<{ pos: Vec3; tgt: Vec3 } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      const g = window as unknown as {
        __rashguardCamera?: { position: Vec3 };
        __rashguardControls?: { target: Vec3 };
      };
      if (g.__rashguardCamera && g.__rashguardControls) {
        const { x, y, z } = g.__rashguardCamera.position;
        const t = g.__rashguardControls.target;
        setLive({ pos: { x, y, z }, tgt: { x: t.x, y: t.y, z: t.z } });
      }
    }, 150);
    return () => window.clearInterval(id);
  }, []);

  const line = live
    ? `${part}: { position: [${round(live.pos.x)}, ${round(live.pos.y)}, ${round(
        live.pos.z,
      )}], target: [${round(live.tgt.x)}, ${round(live.tgt.y)}, ${round(
        live.tgt.z,
      )}] },`
    : '…';

  const copy = async () => {
    const ok = await copyTextToClipboard(
      `// paste into PART_CAMERA_PRESETS in rashguard-config.ts\n  ${line}`,
    );
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border-border bg-background flex flex-col gap-2 border-b p-3 font-mono text-[10px]">
      <div className="text-foreground text-[11px] font-semibold tracking-wide uppercase">
        Camera tuner
      </div>
      <select
        value={part}
        onChange={(event) => {
          const next = event.target.value as RashguardPart;
          setPart(next);
          focusPart(next); // jump to that part's current framing
        }}
        className="border-border bg-background text-foreground h-7 w-full rounded border px-1 text-[11px]"
      >
        {RASHGUARD_PARTS.map((option) => (
          <option key={option} value={option}>
            {RASHGUARD_PART_LABELS[option]}
          </option>
        ))}
      </select>
      <div className="text-muted-foreground leading-snug">
        {PART_CAMERA_PRESETS[part]
          ? 'has a recorded preset — orbit to change it'
          : 'no preset yet — using the plain front/back view'}
      </div>
      <div className="text-muted-foreground leading-snug break-all select-all">
        {line}
      </div>
      <button
        type="button"
        onClick={copy}
        className="border-border text-foreground hover:bg-muted h-7 rounded border text-[10px] font-semibold tracking-wide uppercase"
      >
        {copied ? 'Copied ✓' : 'Copy preset for this part'}
      </button>
    </div>
  );
});

RashguardCameraTuner.displayName = 'RashguardCameraTuner';
