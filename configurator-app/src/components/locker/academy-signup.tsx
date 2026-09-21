/**
 * Academy sign-up — the academies' own front door, at /academy.
 *
 * Unlisted: DSPLN sends the link to academies it wants on the platform, and
 * nothing in the retail Locker points here. The flow is the plan of record's
 * onboarding: pick a plan → create an account (or sign in) → name, logo and
 * colors → card → where will you sell → into the Locker in Academy mode.
 *
 * Each step is derived from what already exists (plan choice, session,
 * academy, subscription, channel), so the page can be reloaded, returned to
 * from Stripe, or reopened weeks later and pick up where it left off.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

import {
  ACADEMY_PLANS,
  planById,
  resetAcademyMode,
  startPlanCheckout,
  type AcademyPlanId,
  type AcademySummary,
} from '../../lib/academy-mode';
import {
  AcademyStore,
  CreateAcademyCard,
  LockerHeader,
  LockerSignIn,
  fetchLockerSession,
  type LockerSession,
} from './the-locker';

const PLAN_STORAGE_KEY = 'dspln:academy:plan';
const SIGNUP_PATH = '/academy';

const label = 'text-[11px] uppercase tracking-[0.16em]';
const card = 'border border-[#e6e4df] bg-white p-6 sm:p-8';
const heading = 'text-[11px] uppercase tracking-[0.18em] text-[#8a8580]';

type Step = 'plan' | 'account' | 'academy' | 'card' | 'store' | 'done';

const STEPS: Array<{ id: Step; text: string }> = [
  { id: 'plan', text: 'Plan' },
  { id: 'account', text: 'Account' },
  { id: 'academy', text: 'Academy' },
  { id: 'card', text: 'Card' },
  { id: 'store', text: 'Store' },
];

function readPlanChoice(): AcademyPlanId | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('plan');
    const candidate = fromUrl ?? window.localStorage.getItem(PLAN_STORAGE_KEY);
    return planById(candidate) ? (candidate as AcademyPlanId) : null;
  } catch {
    return null;
  }
}

function rememberPlanChoice(plan: AcademyPlanId | null) {
  try {
    if (plan) window.localStorage.setItem(PLAN_STORAGE_KEY, plan);
    else window.localStorage.removeItem(PLAN_STORAGE_KEY);
  } catch { /* storage is a convenience, never a requirement */ }
}

/** Read and scrub a one-shot query flag (Stripe's ?checkout=…). */
function takeQueryFlag(key: string): string | null {
  try {
    const url = new URL(window.location.href);
    const value = url.searchParams.get(key);
    if (value !== null) {
      url.searchParams.delete(key);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    return value;
  } catch {
    return null;
  }
}

export function AcademySignup() {
  const [plan, setPlan] = useState<AcademyPlanId | null>(() => readPlanChoice());
  const [session, setSession] = useState<LockerSession | null>(null);
  const [academy, setAcademy] = useState<AcademySummary | null>(null);
  const checkoutOutcome = useMemo(() => takeQueryFlag('checkout'), []);

  const loadSession = useCallback(async () => {
    const next = await fetchLockerSession().catch(() => ({ signedIn: false }) as LockerSession);
    setSession(next);
    setAcademy(next.signedIn ? next.academy ?? null : null);
    return next;
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);

  useEffect(() => {
    if (checkoutOutcome === 'success') {
      resetAcademyMode();
      toast.success('Your plan is active and your card is on file');
    } else if (checkoutOutcome === 'cancelled') {
      toast('No charge was made. Add a card whenever you are ready.');
    }
  }, [checkoutOutcome]);

  const choosePlan = (next: AcademyPlanId | null) => {
    setPlan(next);
    rememberPlanChoice(next);
  };

  const signedIn = Boolean(session?.signedIn);
  const step: Step | null = useMemo(() => {
    if (!session) return null;
    if (academy?.subscription && academy.channel) return 'done';
    if (!plan && !academy?.subscription) return 'plan';
    if (!signedIn) return 'account';
    if (!academy) return 'academy';
    if (!academy.subscription && academy.billingAvailable) return 'card';
    if (!academy.channel) return 'store';
    return 'done';
  }, [session, signedIn, plan, academy]);

  const openLocker = (page = 'designs') => {
    window.location.assign(new URL(`/locker?page=${page}`, window.location.origin).toString());
  };

  const chosen = planById(academy?.subscription?.plan ?? plan);

  return (
    <main className="min-h-screen bg-white font-sans text-[#1c1b1b]">
      <LockerHeader email={session?.signedIn ? session.user?.email : undefined} />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className={`${label} text-[#777]`}>DSPLN for academies</p>
        <h1 className="mt-2 text-2xl uppercase tracking-[0.2em]">
          {step === 'done' ? 'You are set up' : 'Set up your academy'}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#666]">
          Design gear for your students in DSPLN’s 3D tools, publish it to your own store, and
          DSPLN makes, ships and handles every order. Your students see your brand; you never
          touch inventory.
        </p>

        {step && step !== 'done' ? <StepStrip current={step} chosen={chosen?.name ?? null} /> : null}

        <div className="mt-8">
          {!step ? <p className={`${label} py-12 text-center text-[#777]`}>Loading…</p> : null}

          {step === 'plan' ? <PlanStep onChoose={choosePlan} /> : null}

          {step === 'account' ? (
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
              <LockerSignIn
                bare
                initialMode="sign-up"
                title="Your account"
                intro="This is your DSPLN login. You will use it to sign in to your academy, design gear and see orders."
                onSignedIn={() => { void loadSession(); }}
              />
              <PlanSummary plan={chosen} onChange={() => choosePlan(null)} />
            </div>
          ) : null}

          {step === 'academy' ? (
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
              <CreateAcademyCard
                onCreated={(created) => {
                  setAcademy(created);
                  resetAcademyMode();
                }}
              />
              <PlanSummary plan={chosen} onChange={() => choosePlan(null)} />
            </div>
          ) : null}

          {step === 'card' && academy ? (
            <CardStep
              academy={academy}
              plan={plan}
              onChangePlan={() => choosePlan(null)}
              onPickPlan={choosePlan}
            />
          ) : null}

          {step === 'store' && academy ? (
            <div className="max-w-3xl">
              <AcademyStore
                academy={academy}
                onUpdated={(next) => { setAcademy(next); resetAcademyMode(); }}
                onGo={(page) => openLocker(page)}
              />
            </div>
          ) : null}

          {step === 'done' && academy ? (
            <div className={`${card} max-w-3xl`}>
              <h2 className={heading}>{academy.name}</h2>
              <p className="mt-4 text-sm leading-relaxed text-[#666]">
                Your academy, plan and store are set. Everything else happens in the Locker: design
                in the configurators, publish with the Publish Product button, and watch orders come
                in.
              </p>
              <button
                type="button"
                onClick={() => openLocker()}
                className={`mt-6 bg-[#1c1b1b] px-9 py-4 text-white ${label}`}
              >
                Open your Locker
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function StepStrip({ current, chosen }: { current: Step; chosen: string | null }) {
  const index = STEPS.findIndex((entry) => entry.id === current);
  return (
    <ol className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-b border-[#ddd] pb-4">
      {STEPS.map((entry, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={entry.id} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                done ? 'bg-[#1c1b1b] text-white' : active ? 'border border-[#1c1b1b]' : 'border border-[#c9c5bd] text-[#999]'
              }`}
              aria-hidden="true"
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={`${label} ${active ? 'text-[#1c1b1b]' : 'text-[#8a8580]'}`}>
              {entry.text}
              {entry.id === 'plan' && chosen && done ? ` · ${chosen}` : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PlanStep({ onChoose }: { onChoose: (plan: AcademyPlanId) => void }) {
  return (
    <div>
      <p className="mb-5 text-sm leading-relaxed text-[#666]">
        Pick the plan that fits how much of the design you want to own. Nothing is charged until
        you add a card, and you can change plans any time.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {ACADEMY_PLANS.map((plan) => (
          <article key={plan.id} className="flex flex-col border border-[#e6e4df] bg-white p-6">
            <p className={heading}>{plan.tagline}</p>
            <h3 className="mt-2 text-lg uppercase tracking-[0.12em]">{plan.name}</h3>
            <p className="mt-3 text-2xl">
              {plan.price}
              <span className="text-sm text-[#999]"> / month</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#666]">{plan.blurb}</p>
            <ul className="mt-4 flex-1 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-[#444]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1c1b1b]" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onChoose(plan.id)}
              className={`mt-6 bg-[#1c1b1b] px-6 py-4 text-white ${label}`}
            >
              Choose {plan.name}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function PlanSummary({
  plan,
  onChange,
}: {
  plan: ReturnType<typeof planById>;
  onChange: () => void;
}) {
  if (!plan) return null;
  return (
    <aside className={`${card} h-fit`}>
      <p className={heading}>Your plan</p>
      <p className="mt-3 text-lg uppercase tracking-[0.12em]">{plan.name}</p>
      <p className="mt-1 text-sm text-[#666]">{plan.tagline} · {plan.price} a month</p>
      <ul className="mt-4 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-[#444]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1c1b1b]" />
            {feature}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onChange}
        className="mt-5 text-[11px] uppercase tracking-[0.16em] text-[#8a8580] hover:text-[#1c1b1b]"
      >
        Change plan
      </button>
    </aside>
  );
}

/**
 * Card on file, via Stripe Checkout. The same card pays the monthly plan
 * and, when a student orders, the production cost of that order.
 */
function CardStep({
  academy,
  plan,
  onChangePlan,
  onPickPlan,
}: {
  academy: AcademySummary;
  plan: AcademyPlanId | null;
  onChangePlan: () => void;
  onPickPlan: (plan: AcademyPlanId) => void;
}) {
  const [busy, setBusy] = useState(false);
  const chosen = planById(plan);

  if (!chosen) return <PlanStep onChoose={onPickPlan} />;

  const pay = async () => {
    setBusy(true);
    try {
      const url = await startPlanCheckout(academy.id, chosen.id, SIGNUP_PATH);
      if (url) {
        window.location.assign(url);
        return;
      }
      window.location.assign(new URL(`${SIGNUP_PATH}?checkout=success`, window.location.origin).toString());
    } catch (cause) {
      toast.error((cause as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className={card}>
        <h2 className={heading}>Add a card</h2>
        <p className="mt-4 text-sm leading-relaxed text-[#666]">
          {academy.name} is on the {chosen.name} plan at {chosen.price} a month. Add a card and
          the plan starts today. The same card pays the production cost of each order your
          students place, so there is nothing else to set up for payments.
        </p>
        <button
          type="button"
          onClick={() => void pay()}
          disabled={busy}
          className={`mt-6 bg-[#1c1b1b] px-9 py-4 text-white ${label} disabled:opacity-50`}
        >
          {busy ? 'Opening checkout' : 'Continue to payment'}
        </button>
        <p className="mt-4 text-xs text-[#999]">
          Checkout is handled by Stripe. DSPLN never sees your card number. Cancel any time from
          the Billing tab.
        </p>
      </div>
      <PlanSummary plan={chosen} onChange={onChangePlan} />
    </div>
  );
}
