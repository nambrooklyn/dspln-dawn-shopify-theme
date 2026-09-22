// Ported from b2b-platform: choose-plan/payment-header.tsx and
// shopify/shopify-connect-header.tsx. One component, three positions.
import { memo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, CreditCard, Store } from 'lucide-react';

export type OnboardingStage = 'choose-plan' | 'connect-store' | 'complete';

const STAGES: Record<OnboardingStage, { done: string; current: string; width: string; icon?: typeof Store }> = {
  'choose-plan': { done: 'Account Created', current: 'Choose Plan', width: '33%' },
  'connect-store': { done: 'Plan Selected', current: 'Connect Store', width: '66%', icon: Store },
  complete: { done: 'Store Connected', current: 'All Set', width: '100%', icon: CheckCircle },
};

function ProgressHeader({ stage }: { stage: OnboardingStage }) {
  const entry = STAGES[stage];
  const CurrentIcon = entry.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-8"
    >
      <div className="mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
            <CheckCircle className="text-primary h-5 w-5" />
          </div>
          <span className="text-muted-foreground text-sm font-medium">{entry.done}</span>
        </div>
        <div className="text-primary flex items-center gap-2 text-sm font-medium">
          {CurrentIcon ? <CurrentIcon className="h-4 w-4" /> : null}
          {entry.current}
        </div>
      </div>
      <div className="bg-muted mx-auto h-2 w-full rounded-full">
        <motion.div
          initial={{ width: '0%' }}
          animate={{ width: entry.width }}
          transition={{ duration: 1, delay: 0.3 }}
          className="bg-primary h-full rounded-full"
        />
      </div>
    </motion.div>
  );
}

export const OnboardingProgress = memo(ProgressHeader);

function PaymentHeaderBase() {
  return (
    <div className="text-center">
      <OnboardingProgress stage="choose-plan" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="mb-4 flex justify-center">
          <div className="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-2xl">
            <CreditCard className="text-primary h-8 w-8" />
          </div>
        </div>
        <h1 className="text-foreground mb-3 text-3xl font-bold">Choose Your Plan</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl">
          Select the plan that best fits your academy. The same card pays the monthly plan and
          the production cost of each order. You can always upgrade or downgrade as your needs
          change.
        </p>
      </motion.div>
    </div>
  );
}

export const PaymentHeader = memo(PaymentHeaderBase);
