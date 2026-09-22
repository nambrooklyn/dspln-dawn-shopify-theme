/**
 * DSPLN for academies — the whole entry flow, ported from the B2B app
 * (b2b-platform apps/user) onto the Locker's auth, organizations and Stripe:
 *
 *   /academy                 one-page, three-tier subscription page
 *   /academy/signup          create account (+ academy name → organization)
 *   /academy/login           sign in
 *   /academy/forgot-password
 *   /academy/create          name the academy (existing account, no org yet)
 *   /academy/choose-plan     plan → Stripe Checkout (card on file)
 *   /academy/connect-store   connect Shopify / hosted-site list / later
 *   /academy/complete        all set → Open the Locker
 *
 * Redirect rules are the B2B app's onboarding-redirect: not signed in →
 * login; signed in on an auth page → onboarding; no plan → choose-plan; no
 * store → connect-store; else complete. The Locker only appears at the end.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle, Loader2, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

import {
  createAcademy,
  resetAcademyMode,
  startPlanCheckout,
  updateAcademy,
  type AcademyPlanId,
  type AcademySummary,
} from '../lib/academy-mode';
import { fetchLockerSession, type LockerSession } from '../components/locker/the-locker';
import { AuthLayout, LOGO_SRC } from './auth-layout';
import { requestPasswordReset, signIn, signUp } from './auth-api';
import ForgotPasswordForm from './forgot-password-form';
import { OnboardingProgress, PaymentHeader } from './headers';
import Landing from './landing';
import LoginForm from './login-form';
import PlanCard from './plan-card';
import { getPlanById, plans, readPlanChoice, rememberPlanChoice } from './plans';
import ShopifyConnectForm from './shopify-connect-form';
import SignupForm, { type SignupValues } from './signup-form';
import { Button, FieldLabel, FieldMessage, Input, authInputClass } from './ui';

const BASE = '/academy';
const P = {
  landing: BASE,
  signup: `${BASE}/signup`,
  login: `${BASE}/login`,
  forgot: `${BASE}/forgot-password`,
  create: `${BASE}/create`,
  choosePlan: `${BASE}/choose-plan`,
  connectStore: `${BASE}/connect-store`,
  complete: `${BASE}/complete`,
} as const;

type Page = keyof typeof P;

function pageFor(pathname: string): Page {
  const clean = pathname.replace(/\/+$/, '') || BASE;
  const hit = (Object.entries(P) as Array<[Page, string]>).find(([, path]) => path === clean);
  return hit?.[0] ?? 'landing';
}

/**
 * Where a signed-in academy belongs, by what it has done so far.
 *
 * The plan always comes before the store: an academy pays, and only then
 * connects the store it will sell through. Nothing skips the plan step, not
 * even a deploy without Stripe keys — that deploy shows the plans and lets
 * the academy continue without a card, so the order of the funnel is the
 * same everywhere and the store step is never reached un-subscribed.
 */
function onboardingTarget(academy: AcademySummary | null): Page {
  if (!academy) return 'create';
  // A subscription is what clears the plan step. Where billing is not
  // configured at all — the dev deploy — no subscription can exist, so the
  // recorded choice clears it instead and the rest stays testable. On
  // production billingAvailable is true, so only a real subscription counts.
  const planDone = Boolean(academy.subscription) || (!academy.billingAvailable && Boolean(academy.selectedPlan));
  if (!planDone) return 'choosePlan';
  if (!academy.channel) return 'connectStore';
  return 'complete';
}

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

export function AcademyApp() {
  const [page, setPage] = useState<Page>(() => pageFor(window.location.pathname));
  const [session, setSession] = useState<LockerSession | null>(null);
  const [plan, setPlan] = useState<AcademyPlanId | null>(() => readPlanChoice());
  const checkoutOutcome = useMemo(() => takeQueryFlag('checkout'), []);

  const navigate = useCallback((next: Page) => {
    window.history.pushState(null, '', P[next]);
    setPage(next);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => setPage(pageFor(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const loadSession = useCallback(async () => {
    const next = await fetchLockerSession().catch(() => ({ signedIn: false }) as LockerSession);
    setSession(next);
    return next;
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);

  useEffect(() => {
    if (checkoutOutcome === 'success') {
      resetAcademyMode();
      toast.success('Your plan is active and your card is on file');
    } else if (checkoutOutcome === 'cancelled') {
      toast('No charge was made. Choose a plan whenever you are ready.');
    }
  }, [checkoutOutcome]);

  const signedIn = Boolean(session?.signedIn);
  const academy = session?.signedIn ? session.academy ?? null : null;

  // The B2B app's route guards, applied once the session is known.
  useEffect(() => {
    if (!session) return;
    const authPages: Page[] = ['signup', 'login', 'forgot'];
    const onboardingPages: Page[] = ['create', 'choosePlan', 'connectStore', 'complete'];
    if (signedIn && authPages.includes(page)) { navigate(onboardingTarget(academy)); return; }
    if (!signedIn && onboardingPages.includes(page)) { navigate('login'); return; }
    if (signedIn && onboardingPages.includes(page)) {
      const target = onboardingTarget(academy);
      // Earlier steps are never shown again once done; later ones wait their turn.
      const order: Page[] = ['create', 'choosePlan', 'connectStore', 'complete'];
      if (order.indexOf(page) !== order.indexOf(target) && page !== 'complete') navigate(target);
      if (page === 'complete' && target !== 'complete') navigate(target);
    }
  }, [session, signedIn, academy, page, navigate]);

  const choosePlan = (next: AcademyPlanId | null) => { setPlan(next); rememberPlanChoice(next); };

  const setAcademy = (next: AcademySummary | null) => {
    resetAcademyMode();
    setSession((current) => (current ? { ...current, academy: next } : current));
  };

  if (page === 'landing') {
    return (
      <Landing
        signedIn={signedIn}
        continueHref={P[onboardingTarget(academy)]}
        loginHref={P.login}
        onChoosePlan={(id) => { choosePlan(id); navigate(signedIn ? onboardingTarget(academy) : 'signup'); }}
      />
    );
  }

  if (page === 'signup') {
    return (
      <SignupPage
        // Creating the academy already returns everything the plan step
        // needs, so the screen advances on that rather than waiting on a
        // third round trip. The authoritative read still follows.
        onReady={(user, created) => {
          setSession({ signedIn: true, user, academy: created });
          void loadSession();
        }}
      />
    );
  }
  if (page === 'login') return <LoginPage onDone={loadSession} />;
  if (page === 'forgot') return <ForgotPage />;

  if (!session) return <Loading />;

  if (page === 'create') return <CreateAcademyPage onCreated={(a) => { setAcademy(a); navigate(onboardingTarget(a)); }} />;

  if (page === 'choosePlan' && academy) {
    return (
      <ChoosePlanPage
        academy={academy}
        initial={plan}
        onPick={choosePlan}
        onSkipBilling={async (chosen) => {
          // No Stripe on this deploy: remember the choice so the guard lets
          // the academy through to the store step.
          const next = await updateAcademy({ selectedPlan: chosen }).catch(() => null);
          if (next) setAcademy(next);
          navigate('connectStore');
        }}
        // Picked a tier on the one-pager, so go straight to payment rather
        // than asking for the same choice twice. Coming back from a
        // cancelled checkout stops that, or they would bounce to Stripe
        // again the moment they landed.
        autoCheckout={Boolean(plan) && checkoutOutcome !== 'cancelled'}
      />
    );
  }

  if (page === 'connectStore' && academy) {
    return <ConnectStorePage academy={academy} onUpdated={(a) => { setAcademy(a); navigate('complete'); }} onSkip={() => navigate('complete')} />;
  }

  if (page === 'complete' && academy) return <CompletePage academy={academy} />;

  return <Loading />;
}

/* ------------------------------------------------------------------ */

function Loading() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <Loader2 className="text-primary h-6 w-6 animate-spin" />
    </div>
  );
}

function SignupPage({
  onReady,
}: {
  onReady: (user: NonNullable<LockerSession['user']>, academy: AcademySummary) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (values: SignupValues) => {
    setPending(true);
    setError('');
    try {
      const signedUp = await signUp({ name: values.name, email: values.email, password: values.password });
      // The academy is the organization; the signer becomes its owner.
      const created = await createAcademy({ name: values.academyName });
      if (!created) throw new Error('Your account was created but the academy was not. Sign in and try again.');
      onReady(
        {
          id: signedUp.user?.id ?? '',
          email: values.email,
          name: values.name,
          emailVerified: false,
        },
        created,
      );
    } catch (cause) {
      setError((cause as Error).message);
      setPending(false);
    }
  };

  return (
    <AuthLayout homeHref={P.landing}>
      <SignupForm pending={pending} error={error} onSubmit={(v) => void submit(v)} loginHref={P.login} />
    </AuthLayout>
  );
}

function LoginPage({ onDone }: { onDone: () => Promise<LockerSession> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (values: { email: string; password: string }) => {
    setPending(true);
    setError('');
    try {
      await signIn(values);
      await onDone();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout homeHref={P.landing} tone="gray">
      <LoginForm pending={pending} error={error} onSubmit={(v) => void submit(v)} signupHref={P.signup} forgotHref={P.forgot} />
    </AuthLayout>
  );
}

function ForgotPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (email: string) => {
    setPending(true);
    setError('');
    try {
      await requestPasswordReset(email, `${window.location.origin}/locker?reset=1`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthLayout homeHref={P.landing} tone="gray">
      <ForgotPasswordForm pending={pending} error={error} onSubmit={submit} loginHref={P.login} />
    </AuthLayout>
  );
}

/** An existing DSPLN account that has no academy yet: name it, then continue. */
function CreateAcademyPage({ onCreated }: { onCreated: (academy: AcademySummary) => void }) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) { setError('Academy name must be at least 2 characters'); return; }
    setPending(true);
    setError('');
    try {
      const created = await createAcademy({ name: name.trim() });
      if (!created) throw new Error('Could not create your academy.');
      onCreated(created);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout homeHref={P.landing}>
      <div className="relative flex w-full items-center justify-center p-4">
        <div className="relative z-10 w-full max-w-md">
          <div className="border-border shadow-dark/5 rounded-2xl border bg-white p-8 shadow-xl backdrop-blur-sm">
            <div className="mb-8 text-center">
              <div className="mb-6 flex justify-center md:hidden">
                <img src={LOGO_SRC} alt="DSPLN" className="h-12 w-auto" />
              </div>
              <h1 className="text-foreground mb-2 text-2xl font-bold">Name your academy</h1>
              <p className="text-muted-foreground text-sm">This is the brand your students will see on your store</p>
            </div>
            <form onSubmit={(e) => void submit(e)} className="space-y-5" noValidate>
              <div>
                <FieldLabel htmlFor="academy-name">Academy Name</FieldLabel>
                <div className="relative">
                  <GraduationCap className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input id="academy-name" placeholder="Brooklyn Jiu-Jitsu Academy" autoFocus className={authInputClass} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <FieldMessage>{error}</FieldMessage>
              </div>
              <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary-dark group shadow-primary/25 h-11 w-full rounded-xl font-semibold shadow-lg transition-all duration-300">
                <div className="flex items-center justify-center gap-2">
                  {pending ? <><Loader2 className="size-4 animate-spin" /><span className="text-sm">Creating...</span></> : <><span className="text-sm">Continue</span><ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" /></>}
                </div>
              </Button>
            </form>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

// Ported from b2b-platform routes/onboarding/(routes)/choose-plan.tsx
function ChoosePlanPage({
  academy,
  initial,
  onPick,
  onSkipBilling,
  autoCheckout = false,
}: {
  academy: AcademySummary;
  initial: AcademyPlanId | null;
  onPick: (plan: AcademyPlanId) => void;
  onSkipBilling: (plan: AcademyPlanId) => void | Promise<void>;
  autoCheckout?: boolean;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<AcademyPlanId>(initial ?? 'academy/custom');
  const [pending, setPending] = useState(false);

  const handlePlanSelect = useCallback((planId: AcademyPlanId) => {
    setSelectedPlanId(planId);
    onPick(planId);
  }, [onPick]);

  const handlePayment = useCallback(async (planId: AcademyPlanId = selectedPlanId) => {
    setPending(true);
    try {
      const url = await startPlanCheckout(academy.id, planId, P.connectStore, P.choosePlan);
      if (url) { window.location.assign(url); return; }
      window.location.assign(`${P.connectStore}?checkout=success`);
    } catch (cause) {
      toast.error((cause as Error).message);
      setPending(false);
    }
  }, [academy.id, selectedPlanId]);

  // Straight to Stripe for a tier already chosen on the one-pager. Runs once:
  // a failure leaves the plans on screen to choose from by hand.
  const started = useRef(false);
  useEffect(() => {
    if (!autoCheckout || started.current) return;
    if (!initial || !academy.billingAvailable) return;
    started.current = true;
    void handlePayment(initial);
  }, [autoCheckout, initial, academy.billingAvailable, handlePayment]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { when: 'beforeChildren' as const, staggerChildren: 0.1, delay: 0.2 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 200, damping: 20 } },
  };

  const selected = getPlanById(selectedPlanId);

  return (
    <div className="bg-background min-h-screen px-4 py-8">
      <div className="bg-card border-border container mx-auto rounded-xl border p-10 shadow-xl">
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
          <motion.div variants={itemVariants}>
            <PaymentHeader />
          </motion.div>

          <motion.div variants={itemVariants}>
            <div className="mx-auto max-w-5xl">
              <div className="grid gap-6 md:grid-cols-3">
                {plans.map((plan, index) => (
                  <motion.div key={plan.id} variants={itemVariants} transition={{ delay: 0.1 * index }}>
                    <PlanCard plan={plan} isSelected={selectedPlanId === plan.id} onSelect={() => handlePlanSelect(plan.id)} />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <div className="flex flex-col items-center gap-3">
              {academy.billingAvailable ? (
                <Button
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 py-3 font-semibold shadow-lg transition-all duration-300 hover:shadow-xl"
                  size="lg"
                  onClick={() => void handlePayment()}
                  disabled={pending}
                >
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {pending ? 'Taking you to secure checkout' : 'Proceed to Payment'}
                </Button>
              ) : (
                <>
                  <Button
                    className="px-10 py-3 font-semibold shadow-lg"
                    size="lg"
                    disabled={pending}
                    onClick={() => { setPending(true); void Promise.resolve(onSkipBilling(selectedPlanId)).finally(() => setPending(false)); }}
                  >
                    {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue with {selected?.name ?? 'this plan'}
                  </Button>
                  <p className="text-muted-foreground text-xs">
                    Billing is not switched on for this deploy, so no card is taken here. On
                    production this step is Stripe Checkout, and the store comes after it.
                  </p>
                </>
              )}
              <p className="text-muted-foreground text-xs">
                {academy.name} · Checkout is handled by Stripe. DSPLN never sees your card number.
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

// Ported from b2b-platform routes/onboarding/(routes)/shopify.tsx
function ConnectStorePage({
  academy,
  onUpdated,
  onSkip,
}: {
  academy: AcademySummary;
  onUpdated: (academy: AcademySummary) => void;
  onSkip: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const save = async (input: { channel: 'shopify' | 'hosted-site'; shopDomain?: string }) => {
    setPending(true);
    setError('');
    try {
      const next = await updateAcademy({ channel: input.channel, shopDomain: input.shopDomain ?? null });
      if (!next) throw new Error('Could not save your store.');
      toast.success(input.channel === 'shopify' ? 'Store saved. Authorization opens in the next update.' : 'You are on the list for a DSPLN-hosted store.');
      onUpdated(next);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="container mx-auto rounded-xl bg-white p-10 shadow-xl shadow-gray-900/5 backdrop-blur-sm">
        <div className="text-center"><OnboardingProgress stage="connect-store" /></div>
        <div className="mt-8">
          <ShopifyConnectForm
            isConnecting={pending}
            error={error}
            onConnect={(shopDomain) => void save({ channel: 'shopify', shopDomain })}
            onHostedSite={() => void save({ channel: 'hosted-site' })}
            onSkip={onSkip}
          />
        </div>
        <p className="text-muted-foreground mt-8 text-center text-xs">{academy.name}</p>
      </div>
    </div>
  );
}

function CompletePage({ academy }: { academy: AcademySummary }) {
  const plan = getPlanById(academy.subscription?.plan);
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="container mx-auto rounded-xl bg-white p-10 shadow-xl shadow-gray-900/5">
        <div className="text-center"><OnboardingProgress stage="complete" /></div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mx-auto max-w-2xl text-center">
          <div className="mb-6 flex justify-center">
            <div className="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-2xl">
              <CheckCircle className="text-primary h-8 w-8" />
            </div>
          </div>
          <h2 className="font-inter text-foreground mb-3 text-3xl font-bold">{academy.name} is set up</h2>
          <p className="font-albert text-muted-foreground mb-2 text-lg">
            {plan ? `You're on the ${plan.name} plan.` : 'Your academy is ready.'}{' '}
            {academy.channel === 'shopify'
              ? `Your store ${academy.shopDomain ?? ''} is saved and will be ready to connect in the next update.`
              : academy.channel === 'hosted-site'
                ? 'You are on the list for a DSPLN-hosted store.'
                : 'You can connect a store any time from the Locker.'}
          </p>
          <p className="font-albert text-muted-foreground mb-8 text-sm">
            Everything else happens in the Locker: design in the configurators, publish with the Publish Product button, and watch orders come in.
          </p>
          <a href="/locker?page=designs">
            <Button size="lg" className="bg-primary hover:bg-primary-dark h-12 rounded-xl px-8 font-semibold shadow-lg">
              Open the Locker <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </a>
        </motion.div>
      </div>
    </div>
  );
}
