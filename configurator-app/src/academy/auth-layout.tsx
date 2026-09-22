// Ported from b2b-platform apps/user/src/components/auth/sidebar.tsx,
// mobile-header.tsx and routes/(auth)/route.tsx. Copy adjusted for academies.
import { memo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Palette, Shirt, ShoppingBag, Store } from 'lucide-react';

import { cn } from '../lib/utils';

export const LOGO_SRC = '/logos/dspln-wordmark.png';

const features = [
  {
    icon: Palette,
    title: 'Custom Designer',
    description: 'Design gis, rash guards and more for your students in DSPLN’s 3D configurators',
  },
  {
    icon: Store,
    title: 'Shopify Integration',
    description: 'Connect your academy store and publish products directly',
  },
  {
    icon: ShoppingBag,
    title: 'Automatic Orders',
    description: 'Orders from your store are automatically routed to DSPLN for production',
  },
  {
    icon: Shirt,
    title: 'Premium Quality',
    description: 'Competition-grade apparel made to your specifications',
  },
];

function AuthSidebarBase({ homeHref }: { homeHref: string }) {
  return (
    <div className="bg-dark relative hidden overflow-hidden lg:block lg:w-1/2">
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
      <div className="bg-primary/20 pointer-events-none absolute top-1/4 left-1/2 size-64 -translate-x-1/2 rounded-full blur-3xl" />

      <div className="relative z-10 flex h-full flex-col justify-between px-12 py-16">
        <div className="flex flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-md">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-12 text-center"
            >
              <a href={homeHref} className="group inline-block">
                <motion.div whileHover={{ scale: 1.03 }} transition={{ duration: 0.2 }} className="mb-6">
                  <img src={LOGO_SRC} alt="DSPLN" className="mx-auto h-16 w-auto" />
                </motion.div>
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-4"
            >
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * index + 0.3, duration: 0.5 }}
                    className="group flex items-start gap-4"
                  >
                    <div className="group-hover:ring-primary/40 flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20 transition-all duration-300 group-hover:bg-white/15">
                      <Icon className="group-hover:text-primary size-5 text-white/70 transition-colors" />
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-1 text-sm font-semibold text-white">{feature.title}</h3>
                      <p className="text-xs leading-relaxed text-white/60">{feature.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-10 text-center"
        >
          <div className="mx-auto mb-3 h-px w-20 bg-linear-to-r from-transparent via-white/20 to-transparent" />
          <p className="text-[10px] font-medium tracking-widest text-white/60 uppercase">
            DSPLN for Academies
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export const AuthSidebar = memo(AuthSidebarBase);

function AuthMobileHeaderBase({ homeHref }: { homeHref: string }) {
  return (
    <motion.nav
      className={cn('border-border sticky top-0 z-50 w-full border-b lg:hidden', 'bg-dark')}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
    >
      <div className="container mx-auto flex h-16 items-center justify-center px-4">
        <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
          <a href={homeHref} className="group flex items-center gap-3">
            <img src={LOGO_SRC} alt="DSPLN" className="h-9 w-auto" />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white">DSPLN</span>
              <span className="text-secondary text-[10px] font-medium">Academy Portal</span>
            </div>
          </a>
        </motion.div>
      </div>
    </motion.nav>
  );
}

export const AuthMobileHeader = memo(AuthMobileHeaderBase);

/** The (auth) route layout: sidebar on the left, the form on the right. */
export function AuthLayout({ homeHref, children, tone = 'white' }: { homeHref: string; children: ReactNode; tone?: 'white' | 'gray' }) {
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <AuthMobileHeader homeHref={homeHref} />
      <AuthSidebar homeHref={homeHref} />
      <div
        className={cn(
          'flex min-h-[calc(100vh-4rem)] w-full items-center justify-center lg:min-h-screen lg:w-1/2',
          tone === 'gray' ? 'bg-gray-50' : 'bg-white',
        )}
      >
        {children}
      </div>
    </div>
  );
}
