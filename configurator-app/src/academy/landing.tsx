/**
 * The academy one-pager: hero → three plans → how it works → get started.
 * Section order and copy from the dspln-b2b-2 landing; look from the B2B
 * app (dark hero like its auth sidebar, its PlanCard for the tiers).
 */
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { LOGO_SRC } from './auth-layout';
import PlanCard from './plan-card';
import { plans } from './plans';
import { Button } from './ui';
import type { AcademyPlanId } from '../lib/academy-mode';

const steps = [
  ['01', 'Design Your Gear', 'Choose a DSPLN product and make it yours. Add your academy logo or unlock the full 3D configurator for deeper customization.'],
  ['02', 'Publish to Your Store', 'Connect Shopify once. Add the title, description and retail price, then publish directly to your academy store.'],
  ['03', 'Your Customers Order', 'Students shop on your website, under your brand, at the retail price you set. You collect the sale.'],
  ['04', 'We Make It', 'The order comes back to DSPLN automatically. We charge the production cost to your card on file and begin production.'],
  ['05', 'We Fulfill It', 'DSPLN handles production, quality control and shipping. You keep the difference between cost and retail.'],
];

interface LandingProps {
  onChoosePlan: (plan: AcademyPlanId) => void;
  loginHref: string;
  signedIn: boolean;
  continueHref: string;
  /** Root of whichever host is serving this — academy.dspln.com or /academy. */
  homeHref: string;
}

export default function Landing({ onChoosePlan, loginHref, signedIn, continueHref, homeHref }: LandingProps) {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="bg-dark sticky top-0 z-40 border-b border-white/10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <a href={homeHref} className="flex items-center gap-3">
            <img src={LOGO_SRC} alt="DSPLN" className="h-8 w-auto" />
            <span className="text-secondary text-[10px] font-medium tracking-widest uppercase">Academy</span>
          </a>
          <nav className="flex items-center gap-6 text-sm font-medium text-white/80">
            <a href="#plans" className="hidden hover:text-white sm:inline">Plans</a>
            <a href="#how-it-works" className="hidden hover:text-white sm:inline">How it works</a>
            {signedIn ? (
              <a href={continueHref}><Button size="sm" className="bg-primary hover:bg-primary-dark rounded-lg font-semibold">Continue setup</Button></a>
            ) : (
              <a href={loginHref} className="hover:text-white">Sign in</a>
            )}
          </nav>
        </div>
      </header>

      <section className="bg-dark relative overflow-hidden">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
          className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full border border-white/10"
        />
        <motion.div
          animate={{ rotate: [360, 0] }}
          transition={{ duration: 100, repeat: Infinity, ease: 'linear' }}
          className="pointer-events-none absolute -bottom-48 -left-48 size-[31.25rem] rounded-full border border-white/10"
        />
        <div className="bg-primary/20 pointer-events-none absolute top-1/3 left-1/2 size-72 -translate-x-1/2 rounded-full blur-3xl" />
        <div className="relative z-10 container mx-auto px-4 py-24 text-center lg:py-32">
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="mb-4 text-[11px] font-semibold tracking-[0.2em] text-white/60 uppercase"
          >
            Built for Jiu-Jitsu academies
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="font-inter mx-auto max-w-4xl text-4xl font-bold text-white sm:text-5xl lg:text-6xl"
          >
            Build your academy brand.
            <span className="text-white/60"> We handle the rest.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="font-albert mx-auto mt-6 max-w-2xl text-lg text-white/70"
          >
            Design custom Jiu-Jitsu gear, publish it directly to your store, and let DSPLN handle
            production and fulfillment. No inventory. No bulk orders.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10"
          >
            <a href="#plans">
              <Button size="lg" className="bg-primary hover:bg-primary-dark shadow-primary/25 h-12 rounded-xl px-8 font-semibold shadow-lg">
                Choose a plan <ArrowRight className="ml-1 h-5 w-5" />
              </Button>
            </a>
          </motion.div>
        </div>
      </section>

      <section id="plans" className="bg-gray-50 px-4 py-20">
        <div className="container mx-auto">
          <div className="mb-12 text-center">
            <p className="text-primary mb-2 text-[11px] font-semibold tracking-widest uppercase">Memberships</p>
            <h2 className="font-inter text-foreground text-3xl font-bold sm:text-4xl">Choose how far you want to take it.</h2>
            <p className="font-albert text-muted-foreground mx-auto mt-4 max-w-2xl">
              Start with your logo, unlock complete customization, or build a fully private-label collection.
              Nothing is charged until you add a card.
            </p>
          </div>
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-6 md:grid-cols-3">
              {plans.map((plan, index) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + 0.1 * index }}
                >
                  <PlanCard plan={plan} isSelected={plan.popular} cta="Get started" onSelect={() => onChoosePlan(plan.id)} />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="px-4 py-20">
        <div className="container mx-auto">
          <div className="mb-12 text-center">
            <p className="text-primary mb-2 text-[11px] font-semibold tracking-widest uppercase">How DSPLN works</p>
            <h2 className="font-inter text-foreground text-3xl font-bold sm:text-4xl">From idea to delivery, without the overhead.</h2>
            <p className="font-albert text-muted-foreground mt-4">No inventory. No bulk orders. No production management.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-5">
            {steps.map(([number, title, copy], index) => (
              <motion.article
                key={number}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + 0.08 * index }}
                className="border-border bg-card rounded-xl border p-6 shadow-sm"
              >
                <span className="text-primary text-xs font-semibold">{number}</span>
                <h3 className="font-inter text-foreground mt-3 mb-2 text-base font-semibold">{title}</h3>
                <p className="font-albert text-muted-foreground text-sm leading-relaxed">{copy}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-dark px-4 py-20 text-center">
        <p className="mb-2 text-[11px] font-semibold tracking-widest text-white/60 uppercase">Your academy. Your brand.</p>
        <h2 className="font-inter text-3xl font-bold text-white sm:text-4xl">Start building your academy store.</h2>
        <p className="font-albert mx-auto mt-4 max-w-xl text-white/70">Choose the level of customization that's right for your academy.</p>
        <a href="#plans" className="mt-8 inline-block">
          <Button size="lg" className="bg-primary hover:bg-primary-dark h-12 rounded-xl px-8 font-semibold shadow-lg">
            See plans <ArrowRight className="ml-1 h-5 w-5" />
          </Button>
        </a>
      </section>

      <footer className="border-border border-t px-4 py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 text-xs text-gray-500 sm:flex-row">
          <img src={LOGO_SRC} alt="DSPLN" className="h-6 w-auto opacity-70" />
          <p>Built for the art of Jiu-Jitsu.</p>
          <p>© {new Date().getFullYear()} DSPLN</p>
        </div>
      </footer>
    </main>
  );
}
