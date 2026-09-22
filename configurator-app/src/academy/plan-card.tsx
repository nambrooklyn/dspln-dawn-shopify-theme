// Ported from b2b-platform apps/user/src/components/onboarding/choose-plan/plan-card.tsx
import { memo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

import { cn } from '../lib/utils';
import { Badge, Button } from './ui';
import type { Plan } from './plans';

interface PlanCardProps {
  plan: Plan;
  isSelected: boolean;
  onSelect: () => void;
  /** Landing page: the button reads "Get started" and is always solid. */
  cta?: string;
}

function PlanCard({ plan, isSelected, onSelect, cta }: PlanCardProps) {
  const isStarter = plan.tone === 'starter';
  const isCustom = plan.tone === 'custom';
  const isPrivate = plan.tone === 'private';
  const Icon = plan.icon;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={cn(
        'relative h-full rounded-xl border transition-all duration-300',
        isSelected
          ? 'border-primary bg-primary/5 ring-primary/20 shadow-xl ring-2'
          : 'border-border bg-card shadow-md hover:shadow-lg',
      )}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-4 py-1 text-sm font-medium shadow-lg">
            Most Popular
          </Badge>
        </div>
      )}

      <div className="p-6">
        <div className="mb-4 flex justify-center">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl',
              isStarter && 'bg-muted',
              isCustom && 'bg-secondary',
              isPrivate && 'bg-primary',
            )}
          >
            <Icon
              className={cn(
                'h-6 w-6',
                isStarter && 'text-muted-foreground',
                isCustom && 'text-secondary-foreground',
                isPrivate && 'text-primary-foreground',
              )}
            />
          </div>
        </div>

        <div className="mb-5 text-center">
          <p className="text-primary mb-1 text-[11px] font-semibold tracking-widest uppercase">
            {plan.label}
          </p>
          <h3 className="text-foreground mb-1 text-xl font-bold">{plan.name}</h3>
          <p className="text-muted-foreground mb-3 text-sm">{plan.description}</p>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-foreground text-3xl font-bold">
              {plan.currency}
              {plan.price}
            </span>
            <span className="text-muted-foreground text-sm">/month</span>
          </div>
        </div>

        <div className="mb-5 space-y-2">
          {plan.features.map((feature) => (
            <div key={feature} className="flex items-start gap-2">
              <div
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                  isStarter && 'bg-muted',
                  isCustom && 'bg-secondary/20',
                  isPrivate && 'bg-primary/20',
                )}
              >
                <Check
                  className={cn(
                    'h-2.5 w-2.5',
                    isStarter && 'text-muted-foreground',
                    isCustom && 'text-secondary',
                    isPrivate && 'text-primary',
                  )}
                />
              </div>
              <p className="text-foreground text-sm">{feature}</p>
            </div>
          ))}
        </div>

        <Button
          variant={isSelected || cta ? 'default' : 'outline'}
          className={cn(
            'w-full transition-all duration-300',
            (isSelected || cta) && 'bg-primary hover:bg-primary-dark text-primary-foreground',
          )}
          onClick={onSelect}
        >
          {cta ?? (isSelected ? 'Selected' : 'Select Plan')}
        </Button>
      </div>
    </motion.div>
  );
}

export default memo(PlanCard);
