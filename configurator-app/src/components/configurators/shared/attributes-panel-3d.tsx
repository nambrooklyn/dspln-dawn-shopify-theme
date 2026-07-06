import { memo } from 'react';
import { RotateCw } from 'lucide-react';
import { Input } from '@/components/ui/input';

import type { GiLayer } from '../gi/gi-state';

interface AttributesPanel3DProps {
  selectedLayer: GiLayer | null;
  onUpdate: (patch: Partial<GiLayer>) => void;
}

const NumberField = ({
  label,
  value,
  onChange,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
      {label}
    </label>
    <div className="relative">
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="h-8 text-xs"
      />
      {suffix ? (
        <span className="text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2 text-[10px]">
          {suffix}
        </span>
      ) : null}
    </div>
  </div>
);

export const AttributesPanel3D = memo(
  ({ selectedLayer, onUpdate }: AttributesPanel3DProps) => {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Attributes
        </div>
        {!selectedLayer ? (
          <div className="text-muted-foreground text-xs">
            Select an element to edit
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Width"
                value={selectedLayer.widthIn}
                step={0.25}
                suffix="in"
                onChange={(v) => onUpdate({ widthIn: Math.max(0.25, v) })}
              />
              <NumberField
                label="Height"
                value={selectedLayer.heightIn}
                step={0.25}
                suffix="in"
                onChange={(v) => onUpdate({ heightIn: Math.max(0.25, v) })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Rotate"
                value={selectedLayer.rotateDeg}
                step={5}
                suffix="°"
                onChange={(v) => onUpdate({ rotateDeg: v })}
              />
              <NumberField
                label="Scale"
                value={selectedLayer.scalePct}
                step={5}
                suffix="%"
                onChange={(v) => onUpdate({ scalePct: Math.max(10, v) })}
              />
            </div>
            <button
              type="button"
              onClick={() => onUpdate({ rotateDeg: 0, scalePct: 100 })}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-[11px]"
            >
              <RotateCw className="h-3 w-3" />
              Reset transform
            </button>
          </>
        )}
      </div>
    );
  },
);

AttributesPanel3D.displayName = 'AttributesPanel3D';
