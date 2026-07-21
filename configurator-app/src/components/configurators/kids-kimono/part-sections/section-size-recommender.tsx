import { memo, useMemo, useState } from 'react';

import { ChevronDown } from 'lucide-react';

import { SIZE_OPTIONS } from './size-options';

type Unit = 'imperial' | 'metric';
type Fit = '-1' | '0' | '1';

const ADULT_SIZE_TABLE = [
  [
    'A00',
    'A00',
    'A0S',
    'A0S',
    'A0S',
    'A1S',
    'A1S',
    'A1S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'A00',
    'A00',
    'A0S',
    'A0S',
    'A0S',
    'A1S',
    'A1S',
    'A1S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'A00',
    'A00',
    'A0',
    'A0',
    'A0',
    'A1S',
    'A1S',
    'A1S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'A00L',
    'A00L',
    'A0',
    'A0',
    'A0',
    'A1S',
    'A1S',
    'A1S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'A00L',
    'A00L',
    'A0',
    'A0',
    'A0',
    'A1',
    'A1',
    'A1',
    'A2S',
    'A2S',
    'A2S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'A00L',
    'A00L',
    'A0L',
    'A0L',
    'A0L',
    'A1',
    'A1',
    'A1',
    'A2S',
    'A2S',
    'A2S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    '',
    '',
    'A0L',
    'A0L',
    'A0L',
    'A1',
    'A1',
    'A1',
    'A2S',
    'A2S',
    'A2S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    '',
    '',
    'A0L',
    'A0L',
    'A0L',
    'A1',
    'A1',
    'A1',
    'A2S',
    'A2S',
    'A2S',
    'A3S',
    'A3S',
    'A3S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    'A1L',
    'A1L',
    'A1L',
    'A2',
    'A2',
    'A2',
    'A3S',
    'A3S',
    'A3S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    'A1L',
    'A1L',
    'A1L',
    'A2',
    'A2',
    'A2',
    'A3S',
    'A3S',
    'A3S',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    'A1L',
    'A1L',
    'A1L',
    'A2',
    'A2',
    'A2',
    'A3S',
    'A3S',
    'A3S',
    'A4S',
    'A4S',
    'A4S',
    'A5S',
    'A5S',
    'A5S',
    'A6S',
    'A6S',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    'A1L',
    'A1L',
    'A1L',
    'A2',
    'A2',
    'A2',
    'A3',
    'A3',
    'A3',
    'A4S',
    'A4S',
    'A4S',
    'A5S',
    'A5S',
    'A5S',
    'A6S',
    'A6S',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A2L',
    'A2L',
    'A2L',
    'A3',
    'A3',
    'A3',
    'A4S',
    'A4S',
    'A4S',
    'A5S',
    'A5S',
    'A5S',
    'A6S',
    'A6S',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A2L',
    'A2L',
    'A2L',
    'A3',
    'A3',
    'A3',
    'A4S',
    'A4S',
    'A4S',
    'A5S',
    'A5S',
    'A5S',
    'A6S',
    'A6S',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A2L',
    'A2L',
    'A2L',
    'A3L',
    'A3L',
    'A3L',
    'A4',
    'A4',
    'A4',
    'A5S',
    'A5S',
    'A5S',
    'A6S',
    'A6S',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A2L',
    'A2L',
    'A2L',
    'A3L',
    'A3L',
    'A3L',
    'A4',
    'A4',
    'A4',
    'A5S',
    'A5S',
    'A5S',
    'A6S',
    'A6S',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A3L',
    'A3L',
    'A3L',
    'A4',
    'A4',
    'A4',
    'A5',
    'A5',
    'A5',
    'A6',
    'A6',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A3L',
    'A3L',
    'A3L',
    'A4',
    'A4',
    'A4',
    'A5',
    'A5',
    'A5',
    'A6',
    'A6',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A3L',
    'A3L',
    'A3L',
    'A4L',
    'A4L',
    'A4L',
    'A5',
    'A5',
    'A5',
    'A6',
    'A6',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A4L',
    'A4L',
    'A4L',
    'A5',
    'A5',
    'A5',
    'A6',
    'A6',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A4L',
    'A4L',
    'A4L',
    'A5L',
    'A5L',
    'A5L',
    '',
    '',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A4L',
    'A4L',
    'A4L',
    'A5L',
    'A5L',
    'A5L',
    '',
    '',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'A5L',
    'A5L',
    'A5L',
    '',
    '',
  ],
];

const WIDTH_ORDER = ['A00', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

function parseSize(size: string) {
  const suffix = size.endsWith('S') || size.endsWith('L') ? size.slice(-1) : '';
  return { num: suffix ? size.slice(0, -1) : size, suffix };
}

function nearestSize(heightIndex: number, weightIndex: number) {
  for (let radius = 1; radius <= 5; radius += 1) {
    for (let dh = -radius; dh <= radius; dh += 1) {
      for (let dw = -radius; dw <= radius; dw += 1) {
        if (Math.abs(dh) !== radius && Math.abs(dw) !== radius) continue;
        const row = heightIndex + dh;
        const col = weightIndex + dw;
        if (row < 0 || row > 22 || col < 0 || col > 21) continue;
        const size = ADULT_SIZE_TABLE[row]?.[col];
        if (size) return size;
      }
    }
  }
  return null;
}

function recommendSize(
  heightInches: number,
  weightInput: number,
  unit: Unit,
  fit: Fit,
) {
  const weightLbs = unit === 'metric' ? weightInput * 2.2046 : weightInput;
  if (!heightInches || !weightLbs || heightInches < 60 || weightLbs < 80) {
    return null;
  }

  const heightIndex = Math.min(22, Math.max(0, Math.round(heightInches - 60)));
  const weightIndex = Math.min(
    21,
    Math.max(0, Math.round((weightLbs - 90) / 10)),
  );
  const baseSize =
    ADULT_SIZE_TABLE[heightIndex]?.[weightIndex] ||
    nearestSize(heightIndex, weightIndex);
  if (!baseSize) return null;

  const parsed = parseSize(baseSize);
  const widthIndex = WIDTH_ORDER.indexOf(parsed.num);
  if (widthIndex === -1) return null;

  if (fit === '1') {
    return `${WIDTH_ORDER[Math.min(WIDTH_ORDER.length - 1, widthIndex + 1)]}S`;
  }

  if (fit === '-1') {
    return `${WIDTH_ORDER[Math.max(0, widthIndex - 1)]}${parsed.suffix}`;
  }

  return baseSize;
}

const HEIGHT_OPTIONS = Array.from({ length: 23 }, (_, index) => index + 60);

function heightLabel(inches: number, unit: Unit) {
  if (unit === 'metric') return `${Math.round(inches * 2.54)} cm`;
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

interface SectionSizeRecommenderProps {
  selectedSize: string;
  onUseSize: (size: string) => void;
}

export const SectionSizeRecommender = memo(
  ({ selectedSize, onUseSize }: SectionSizeRecommenderProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [unit, setUnit] = useState<Unit>('imperial');
    const [height, setHeight] = useState('');
    const [weight, setWeight] = useState('');
    const [fit, setFit] = useState<Fit>('0');

    const recommendation = useMemo(() => {
      const heightInches = Number(height);
      const weightValue = Number(weight);
      return recommendSize(heightInches, weightValue, unit, fit);
    }, [fit, height, unit, weight]);

    const canUseSize = recommendation && SIZE_OPTIONS.includes(recommendation);

    return (
      <div className="border-border bg-muted/20 mt-3 rounded-md border p-3">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="text-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            Find my size
          </span>
          <span className="flex items-center gap-3">
            {isOpen ? (
              <span
                className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.12em] uppercase"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setUnit('imperial')}
                  className={
                    unit === 'imperial'
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  }
                >
                  Imperial
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => setUnit('metric')}
                  className={
                    unit === 'metric' ? 'text-primary' : 'text-muted-foreground'
                  }
                >
                  Metric
                </button>
              </span>
            ) : null}
            <ChevronDown
              className={`text-muted-foreground h-4 w-4 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </span>
        </button>

        {isOpen ? (
          <div className="mt-3">
            <div className="grid grid-cols-[0.9fr_0.9fr_1.1fr] gap-2">
              <label className="text-muted-foreground text-[11px]">
                Height
                <select
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  className="border-border bg-background text-foreground mt-1 h-9 w-full rounded border px-2 text-xs"
                >
                  <option value="">Select</option>
                  {HEIGHT_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {heightLabel(value, unit)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-muted-foreground text-[11px]">
                Weight
                <input
                  type="number"
                  inputMode="decimal"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  placeholder={unit === 'imperial' ? 'lbs' : 'kg'}
                  className="border-border bg-background text-foreground mt-1 h-9 w-full rounded border px-2 text-xs"
                />
              </label>
              <label className="text-muted-foreground text-[11px]">
                Fit
                <select
                  value={fit}
                  onChange={(event) => setFit(event.target.value as Fit)}
                  className="border-border bg-background text-foreground mt-1 h-9 w-full rounded border px-2 text-xs"
                >
                  <option value="0">Regular</option>
                  <option value="-1">Snug</option>
                  <option value="1">Loose</option>
                </select>
              </label>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-muted-foreground text-[10px] tracking-[0.12em] uppercase">
                  Recommended
                </div>
                <div className="text-foreground text-lg font-semibold">
                  {recommendation ?? '--'}
                </div>
              </div>
              <button
                type="button"
                disabled={!canUseSize || recommendation === selectedSize}
                onClick={() => recommendation && onUseSize(recommendation)}
                className="border-border bg-background text-foreground hover:border-foreground disabled:text-muted-foreground disabled:hover:border-border h-9 rounded border px-3 text-[11px] font-semibold tracking-wide uppercase transition-colors disabled:cursor-not-allowed"
              >
                {recommendation === selectedSize ? 'Selected' : 'Use size'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

SectionSizeRecommender.displayName = 'SectionSizeRecommender';
