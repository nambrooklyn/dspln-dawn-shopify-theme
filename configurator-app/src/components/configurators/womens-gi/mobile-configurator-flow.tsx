import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useGiState } from './gi-state';
import {
  BELT_COLOR_SWATCHES,
  GI_COLOR_SWATCHES,
  GI_PART_PRICES,
  KIMONO_LOGO_SLOT_LABEL,
  KIMONO_LOGO_SLOTS,
  KIMONO_SUBPART_LABEL,
  KIMONO_SUBPARTS,
  PANT_LOGO_SLOT_LABEL,
  PANT_LOGO_SLOTS,
  PANT_SUBPART_LABEL,
  PANT_SUBPARTS,
  type GiPart,
} from './gi-config';
import { SectionAddRemove } from './part-sections/section-add-remove';
import { SectionColorSwatches } from './part-sections/section-color-swatches';
import { SectionKimonoSize } from './part-sections/section-kimono-size';
import { SectionLogoUpload } from './part-sections/section-logo-upload';
import { SectionSizeSelect } from './part-sections/section-size-select';
import { BeltEndTextSection } from './part-sections/belt-sections';
import { BELT_BASE_SIZES as BELT_SIZE_OPTIONS } from './part-sections/size-options';

const KIMONO_LOGO_PRICE_LABEL: Record<
  (typeof KIMONO_LOGO_SLOTS)[number],
  string
> = {
  'left-chest': '+$10',
  'left-sleeve': '+$10',
  'right-sleeve': '+$10',
  back: '+$25',
};

const ADD_ON_PRICE = 10;
const BACK_LOGO_PRICE = 25;

interface MobileStep {
  key: string;
  title: string;
  part: GiPart;
  content: ReactNode;
  description?: ReactNode;
}

const PREFERRED_MOBILE_STEP_BY_PART: Partial<Record<GiPart, string>> = {
  belt: 'belt-size',
};

function indexForPart(steps: MobileStep[], part: GiPart) {
  const preferredKey = PREFERRED_MOBILE_STEP_BY_PART[part];
  const preferredIndex = preferredKey
    ? steps.findIndex((step) => step.key === preferredKey)
    : -1;

  if (preferredIndex >= 0) return preferredIndex;

  const partIndex = steps.findIndex((step) => step.part === part);
  return partIndex >= 0 ? partIndex : 0;
}

function BeltSizeSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="border-border border-b px-3 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-foreground text-[12px] font-semibold tracking-wide uppercase">
          Belt Size
        </h3>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          {value}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {BELT_SIZE_OPTIONS.map((size) => {
          const isSelected = size === value;
          return (
            <button
              key={size}
              type="button"
              onClick={() => onChange(size)}
              aria-pressed={isSelected}
              className={`h-8 rounded-sm border text-[12px] font-bold tracking-wide text-[#17115f] transition-colors ${
                isSelected
                  ? 'border-2 border-[#17115f] bg-white shadow-sm'
                  : 'border-border bg-background hover:border-[#17115f]/50'
              }`}
            >
              {size}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MobileStepFrame({
  title,
  current,
  total,
  onPrevious,
  onNext,
  children,
  description,
}: {
  title: string;
  current: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  children: ReactNode;
  description?: ReactNode;
}) {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-[44rem] px-5 pt-0 pb-4">
        <div className="mb-0 pt-1">
          <div className="relative flex min-h-10 items-center justify-between">
            <button
              type="button"
              onClick={onPrevious}
              className="text-muted-foreground hover:text-foreground flex h-10 w-10 items-center justify-center rounded-full transition-colors"
              aria-label="Previous customization"
            >
              <ChevronLeft className="h-8 w-8" strokeWidth={2.2} />
            </button>
            <div className="pointer-events-none absolute left-8 right-24 min-w-0 text-left">
              <h2 className="text-foreground truncate text-[15px] font-semibold tracking-tight sm:text-[17px]">
                {title}
              </h2>
            </div>
            <p className="text-muted-foreground ml-auto mr-1 shrink-0 text-right text-[10px] font-medium tracking-[0.12em] uppercase">
              {current} / {total}
            </p>
            <button
              type="button"
              onClick={onNext}
              className="text-muted-foreground hover:text-foreground flex h-10 w-10 items-center justify-center rounded-full transition-colors"
              aria-label="Next customization"
            >
              <ChevronRight className="h-8 w-8" strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <div className="mobile-step-card max-h-[min(20rem,42svh)] overflow-y-auto overscroll-contain rounded-none bg-white">
          {children}
        </div>
        {description ? (
          <div className="text-foreground mt-2 text-center text-xs leading-snug">
            {description}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const MobileConfiguratorFlow = memo(
  ({
    onAddToCart,
    isAddingToCart,
    cartActionLabel = 'Add to Cart',
    cartActionLoadingLabel = 'Adding...',
  }: {
    onAddToCart: () => void;
    isAddingToCart?: boolean;
    cartActionLabel?: string;
    cartActionLoadingLabel?: string;
  }) => {
    const {
      selectedPart,
      setSelectedPart,
      partVisibility,
      setPartVisible,
      partColors,
      setPartColor,
      kimonoSubColors,
      setKimonoSubColor,
      kimonoLogos,
      setKimonoLogo,
      removeKimonoLogo,
      beltEmbroidery,
      setBeltEmbroidery,
      beltSize,
      setBeltSize,
      pantSize,
      setPantSize,
      pantSubColors,
      setPantSubColor,
      pantLogos,
      setPantLogo,
      removePantLogo,
    } = useGiState();

    const steps = useMemo<MobileStep[]>(() => {
      const kimonoSteps: MobileStep[] = [
        {
          key: 'kimono-add',
          title: 'Kimono',
          part: 'jacket',
          description: 'Kimono is made of 350gsm Pearl Weave fabric.',
          content: (
            <SectionAddRemove
              addLabel="Add Kimono (+$55)"
              removeLabel="Remove Kimono"
              included={partVisibility.jacket}
              onAdd={() => setPartVisible('jacket', true)}
              onRemove={() => setPartVisible('jacket', false)}
            />
          ),
        },
        {
          key: 'kimono-size',
          title: 'Kimono Size',
          part: 'jacket',
          content: <SectionKimonoSize />,
        },
        ...KIMONO_SUBPARTS.map<MobileStep>((sub) => ({
          key: `kimono-${sub}`,
          title: KIMONO_SUBPART_LABEL[sub],
          part: 'jacket',
          content: (
            <SectionColorSwatches
              title={KIMONO_SUBPART_LABEL[sub]}
              value={kimonoSubColors[sub]}
              onChange={(hex) => setKimonoSubColor(sub, hex)}
            />
          ),
        })),
        ...KIMONO_LOGO_SLOTS.map<MobileStep>((slot) => {
          const logo = kimonoLogos[slot];
          return {
            key: `kimono-logo-${slot}`,
            title: KIMONO_LOGO_SLOT_LABEL[slot],
            part: 'jacket',
            content: (
              <SectionLogoUpload
                title={KIMONO_LOGO_SLOT_LABEL[slot]}
                priceLabel={KIMONO_LOGO_PRICE_LABEL[slot]}
                imageUrl={logo?.imageUrl}
                filename={logo?.filename}
                onUpload={(file, dim) =>
                  setKimonoLogo(slot, {
                    imageUrl: URL.createObjectURL(file),
                    imageWidth: dim.width,
                    imageHeight: dim.height,
                    filename: file.name,
                    file,
                  })
                }
                onRemove={() => removeKimonoLogo(slot)}
              />
            ),
          };
        }),
      ];

      const beltSteps: MobileStep[] = [
        {
          key: 'belt-add',
          title: 'Belt',
          part: 'belt',
          content: (
            <SectionAddRemove
              addLabel="Add Belt (+$15)"
              removeLabel="Remove Belt"
              included={partVisibility.belt}
              onAdd={() => setPartVisible('belt', true)}
              onRemove={() => setPartVisible('belt', false)}
            />
          ),
        },
        {
          key: 'belt-size',
          title: 'Belt Size',
          part: 'belt',
          content: <BeltSizeSection value={beltSize} onChange={setBeltSize} />,
        },
        {
          key: 'belt-color',
          title: 'Belt Color',
          part: 'belt',
          content: (
            <SectionColorSwatches
              title="Belt Color"
              value={partColors.belt}
              onChange={(hex) => setPartColor('belt', hex)}
              swatches={BELT_COLOR_SWATCHES}
            />
          ),
        },
        {
          key: 'belt-left-text',
          title: 'Left Belt End Text',
          part: 'belt',
          content: (
            <BeltEndTextSection
              title="Left Belt End Text"
              value={beltEmbroidery.leftEnd}
              placeholder="TEXT HERE"
              font={beltEmbroidery.leftFont}
              color={beltEmbroidery.leftThreadColor}
              onTextChange={(leftEnd) => setBeltEmbroidery({ leftEnd })}
              onFontChange={(leftFont) => setBeltEmbroidery({ leftFont })}
              onColorChange={(leftThreadColor) =>
                setBeltEmbroidery({ leftThreadColor })
              }
            />
          ),
        },
        {
          key: 'belt-right-text',
          title: 'Right Belt End Text',
          part: 'belt',
          content: (
            <BeltEndTextSection
              title="Right Belt End Text"
              value={beltEmbroidery.rightEnd}
              placeholder="TEXT HERE"
              font={beltEmbroidery.rightFont}
              color={beltEmbroidery.rightThreadColor}
              onTextChange={(rightEnd) => setBeltEmbroidery({ rightEnd })}
              onFontChange={(rightFont) => setBeltEmbroidery({ rightFont })}
              onColorChange={(rightThreadColor) =>
                setBeltEmbroidery({ rightThreadColor })
              }
            />
          ),
        },
      ];

      const pantSteps: MobileStep[] = [
        {
          key: 'pant-add',
          title: 'Pant',
          part: 'pants',
          description: 'Pant is made of 12oz Cotton Canvas fabric.',
          content: (
            <SectionAddRemove
              addLabel="Add Pant (+$45)"
              removeLabel="Remove Pant"
              included={partVisibility.pants}
              onAdd={() => setPartVisible('pants', true)}
              onRemove={() => setPartVisible('pants', false)}
            />
          ),
        },
        {
          key: 'pant-size',
          title: 'Pant Size',
          part: 'pants',
          content: (
            <SectionSizeSelect
              title="Pant Size"
              value={pantSize}
              onChange={setPantSize}
            />
          ),
        },
        ...PANT_SUBPARTS.map<MobileStep>((sub) => ({
          key: `pant-${sub}`,
          title: PANT_SUBPART_LABEL[sub],
          part: 'pants',
          content: (
            <SectionColorSwatches
              title={PANT_SUBPART_LABEL[sub]}
              value={pantSubColors[sub]}
              onChange={(hex) => setPantSubColor(sub, hex)}
              swatches={GI_COLOR_SWATCHES}
            />
          ),
        })),
        ...PANT_LOGO_SLOTS.map<MobileStep>((slot) => {
          const logo = pantLogos[slot];
          return {
            key: `pant-logo-${slot}`,
            title: PANT_LOGO_SLOT_LABEL[slot],
            part: 'pants',
            content: (
              <SectionLogoUpload
                title={PANT_LOGO_SLOT_LABEL[slot]}
                priceLabel="+$10"
                imageUrl={logo?.imageUrl}
                filename={logo?.filename}
                onUpload={(file, dim) =>
                  setPantLogo(slot, {
                    imageUrl: URL.createObjectURL(file),
                    imageWidth: dim.width,
                    imageHeight: dim.height,
                    filename: file.name,
                    file,
                  })
                }
                onRemove={() => removePantLogo(slot)}
              />
            ),
          };
        }),
      ];

      return [...kimonoSteps, ...beltSteps, ...pantSteps];
    }, [
      beltEmbroidery.leftEnd,
      beltEmbroidery.leftFont,
      beltEmbroidery.leftThreadColor,
      beltEmbroidery.rightEnd,
      beltEmbroidery.rightFont,
      beltEmbroidery.rightThreadColor,
      beltSize,
      kimonoLogos,
      kimonoSubColors,
      pantLogos,
      pantSize,
      pantSubColors,
      partColors.belt,
      partVisibility.belt,
      partVisibility.jacket,
      partVisibility.pants,
      removeKimonoLogo,
      removePantLogo,
      setBeltEmbroidery,
      setBeltSize,
      setKimonoLogo,
      setKimonoSubColor,
      setPantLogo,
      setPantSize,
      setPantSubColor,
      setPartColor,
      setPartVisible,
    ]);

    const [stepIndex, setStepIndex] = useState(() =>
      indexForPart(steps, selectedPart),
    );
    const step = steps[stepIndex] ?? steps[0];
    const mobileStepPartRef = useRef(selectedPart);

    useEffect(() => {
      if (!step) return;
      mobileStepPartRef.current = step.part;
      setSelectedPart(step.part);
    }, [setSelectedPart, step]);

    useEffect(() => {
      if (selectedPart === mobileStepPartRef.current) return;
      setStepIndex(indexForPart(steps, selectedPart));
    }, [selectedPart, steps]);

    const addOnTotal =
      Object.entries(kimonoLogos).reduce((sum, [slot, logo]) => {
        if (!logo || !partVisibility.jacket) return sum;
        return sum + (slot === 'back' ? BACK_LOGO_PRICE : ADD_ON_PRICE);
      }, 0) +
      (partVisibility.pants
        ? Object.values(pantLogos).filter(Boolean).length * ADD_ON_PRICE
        : 0) +
      (partVisibility.belt
        ? (beltEmbroidery.leftEnd.trim() ? ADD_ON_PRICE : 0) +
          (beltEmbroidery.rightEnd.trim() ? ADD_ON_PRICE : 0)
        : 0);
    const total =
      Object.entries(partVisibility).reduce(
        (sum, [part, visible]) =>
          sum + (visible ? GI_PART_PRICES[part as GiPart] : 0),
        0,
      ) + addOnTotal;

    if (!step) return null;

    return (
      <>
        <MobileStepFrame
          title={step.title}
          current={stepIndex + 1}
          total={steps.length}
          onPrevious={() =>
            setStepIndex((current) =>
              current === 0 ? steps.length - 1 : current - 1,
            )
          }
          onNext={() =>
            setStepIndex((current) =>
              current === steps.length - 1 ? 0 : current + 1,
            )
          }
          description={step.description}
        >
          {step.content}
        </MobileStepFrame>
        <div className="bg-background border-border sticky bottom-0 z-20 border-t px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <div className="mx-auto grid max-w-[44rem] gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-foreground min-w-0 truncate text-left text-base font-semibold tracking-[0.08em] uppercase">
                Womens Custom Gi Suit
              </p>
              <p className="text-foreground shrink-0 text-right text-base font-semibold">
                ${total.toFixed(2)}
              </p>
            </div>
            <button
              type="button"
              onClick={onAddToCart}
              disabled={isAddingToCart}
              className="bg-foreground text-background h-[2.625rem] w-full rounded-lg text-sm font-semibold tracking-[0.12em] uppercase disabled:opacity-60"
            >
              {isAddingToCart ? cartActionLoadingLabel : cartActionLabel}
            </button>
          </div>
        </div>
      </>
    );
  },
);

MobileConfiguratorFlow.displayName = 'MobileConfiguratorFlow';
