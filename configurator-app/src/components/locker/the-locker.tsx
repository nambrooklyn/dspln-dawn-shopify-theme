/**
 * The Locker — DSPLN's customer dashboard (platform-owned "my account").
 *
 * Identity: Shopify Customer Account API OAuth (passwordless email code).
 * Orders: queried live from the Customer Account GraphQL API.
 * Designs: the platform's own /api/customer-designs store.
 *
 * Layout mirrors the DSPLN account shell: black icon rail, gray profile
 * panel, white content with horizontal tabs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  beginLogin,
  completeLogin,
  isConfigured,
  isLoggedIn,
  logout,
} from '../../lib/customer-auth';
import {
  fetchOrders,
  fetchProfile,
  type CustomerOrder,
  type CustomerProfile,
} from '../../lib/customer-api';
import { storefrontOrigin } from '../configurators/shared/storefront-links';

type Tab = 'overview' | 'orders' | 'designs';

interface PortalDesign {
  id: string;
  name?: string;
  productHandle?: string;
  thumbnailUrl?: string | null;
  updatedAt?: string;
}

const label = 'text-[11px] uppercase tracking-[0.16em]';

function formatDate(value: string | undefined): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

function formatMoney(amount: string, currency: string): string {
  if (!amount) return '';
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) return `${amount} ${currency}`;
  return `$${numeric.toFixed(2)} ${currency}`;
}

function StatusBadge({ value }: { value: string | null }) {
  const good = value === 'PAID' || value === 'FULFILLED';
  const alert = value === 'REFUNDED' || value === 'VOIDED';
  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap border border-[#dddddd] px-3 py-0.5 ${label} text-[#1c1b1b]`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          good ? 'bg-[#1c1b1b]' : alert ? 'bg-[#5c0000]' : 'bg-[#6a6a6a]'
        }`}
      />
      {(value ?? 'PENDING').replace(/_/g, ' ')}
    </span>
  );
}

async function fetchDesigns(email: string): Promise<PortalDesign[]> {
  try {
    const url = new URL('/api/customer-designs', window.location.origin);
    url.searchParams.set('customerEmail', email);
    const response = await fetch(url);
    if (!response.ok) return [];
    const payload = await response.json();
    const designs = payload?.data?.designs ?? payload?.designs ?? [];
    return Array.isArray(designs) ? designs : [];
  } catch {
    return [];
  }
}

export function TheLocker() {
  const [phase, setPhase] = useState<'boot' | 'login' | 'loading' | 'ready' | 'error'>('boot');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [designs, setDesigns] = useState<PortalDesign[]>([]);

  const shopOrigin = useMemo(() => storefrontOrigin(), []);

  const loadPortal = useCallback(async () => {
    setPhase('loading');
    try {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
      const [nextOrders, nextDesigns] = await Promise.all([
        fetchOrders().catch(() => [] as CustomerOrder[]),
        nextProfile.email ? fetchDesigns(nextProfile.email) : Promise.resolve([]),
      ]);
      setOrders(nextOrders);
      setDesigns(nextDesigns);
      setPhase('ready');
    } catch (cause) {
      if ((cause as Error).message === 'not-authenticated') {
        setPhase('login');
        return;
      }
      setError((cause as Error).message);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (window.location.pathname.startsWith('/locker/callback')) {
        try {
          await completeLogin();
          window.history.replaceState(null, '', '/locker');
        } catch (cause) {
          setError((cause as Error).message);
          setPhase('error');
          return;
        }
      }
      if (!isLoggedIn()) {
        setPhase('login');
        return;
      }
      await loadPortal();
    })();
  }, [loadPortal]);

  const initials = profile
    ? `${profile.firstName.slice(0, 1)}${profile.lastName.slice(0, 1)}`.toUpperCase() || 'D'
    : 'D';
  const totalSpent = orders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
  const currency = orders[0]?.totalCurrency ?? 'USD';

  if (phase === 'boot' || phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white font-sans text-[#1c1b1b]">
        <p className={`${label} text-[#6a6a6a]`}>Loading your account…</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-6 font-sans text-[#1c1b1b]">
        <h1 className="text-xl uppercase tracking-[0.2em]">The Locker</h1>
        <p className="max-w-md text-center text-sm text-[#6a6a6a]">{error}</p>
        <button
          type="button"
          onClick={() => beginLogin()}
          className={`border border-[#1c1b1b] bg-[#1c1b1b] px-8 py-3 text-white ${label} hover:bg-white hover:text-[#1c1b1b]`}
        >
          Try signing in again
        </button>
      </div>
    );
  }

  if (phase === 'login') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-white px-6 font-sans text-[#1c1b1b]">
        <div className="flex h-14 w-14 items-center justify-center bg-[#1c1b1b] text-2xl text-white">D</div>
        <div className="text-center">
          <h1 className="text-2xl uppercase tracking-[0.24em]">The Locker</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#6a6a6a]">
            Sign in with your email — we’ll send you a one-time code. Your designs and orders
            are waiting in your Locker.
          </p>
        </div>
        {isConfigured() ? (
          <button
            type="button"
            onClick={() => beginLogin()}
            className={`min-w-64 border border-[#1c1b1b] bg-[#1c1b1b] px-10 py-4 text-white ${label} transition-colors hover:bg-white hover:text-[#1c1b1b]`}
          >
            Sign in
          </button>
        ) : (
          <p className="max-w-md border border-[#dddddd] bg-[#f7f7f7] p-4 text-center text-xs leading-relaxed text-[#6a6a6a]">
            Portal not configured yet: set VITE_SHOPIFY_CUSTOMER_CLIENT_ID (and
            VITE_SHOPIFY_SHOP_ID) from the Headless channel’s Customer Account API settings,
            or for a quick test set localStorage “dspln:locker:client-id”.
          </p>
        )}
        <a href={shopOrigin} className={`${label} text-[#6a6a6a] underline underline-offset-4 hover:text-[#1c1b1b]`}>
          Back to store
        </a>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; text: string }> = [
    { id: 'overview', text: 'Overview' },
    { id: 'orders', text: 'Orders' },
    { id: 'designs', text: 'My Designs' },
  ];

  const railItem = `flex w-full flex-col items-center gap-1 px-1 py-3 ${label} text-[#b1b1b1] transition-colors hover:text-white`;

  return (
    <div className="min-h-screen bg-white font-sans text-[#1c1b1b]">
      <div className="mx-auto grid max-w-[1420px] grid-cols-1 lg:grid-cols-[64px_280px_1fr]">
        {/* Black icon rail */}
        <nav className="flex items-center justify-around bg-[#1c1b1b] px-2 py-2 lg:min-h-screen lg:flex-col lg:justify-start lg:py-6" aria-label="DSPLN">
          <a href={shopOrigin} className="mb-0 flex h-9 w-9 items-center justify-center border border-white/40 text-white lg:mb-6" aria-label="DSPLN home">
            D
          </a>
          <a href={shopOrigin} className={railItem}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M3 9.5 10 3l7 6.5M5 8.5V17h10V8.5" /></svg>
            Home
          </a>
          <a href={`${shopOrigin}/collections/all`} className={railItem}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M4 6h12l-1 11H5L4 6ZM7 6a3 3 0 0 1 6 0" /></svg>
            Shop
          </a>
          <span className={`${railItem} cursor-default text-white`}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><circle cx="10" cy="6.5" r="3" /><path d="M4 17c.8-3.2 3.1-4.8 6-4.8s5.2 1.6 6 4.8" /></svg>
            Account
          </span>
          <button type="button" onClick={logout} className={`${railItem} lg:mt-auto`}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M12 4H5v12h7M9 10h8m0 0-3-3m3 3-3 3" /></svg>
            Log out
          </button>
        </nav>

        {/* Gray profile panel */}
        <aside className="bg-[#f7f7f7] px-6 py-8 text-center lg:min-h-screen">
          <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center bg-[#1c1b1b] text-2xl uppercase tracking-[0.12em] text-white">
            {initials}
          </div>
          <p className="text-[15px] uppercase tracking-[0.08em]">
            {profile?.firstName} {profile?.lastName}
          </p>
          <p className="mt-1 break-all text-[13px] text-[#6a6a6a]">{profile?.email}</p>
          <div className="mt-7 border-t border-[#dddddd] pt-5">
            <p className={`${label} mb-1`}>Member of DSPLN</p>
            <p className="text-[13px] leading-relaxed text-[#6a6a6a]">
              {orders.length} order{orders.length === 1 ? '' : 's'} · {designs.length} saved design
              {designs.length === 1 ? '' : 's'}
            </p>
          </div>
        </aside>

        {/* White content + tabs */}
        <main className="px-6 py-8 lg:px-12">
          <h1 className="mb-6 text-xl uppercase tracking-[0.2em]">The Locker</h1>

          <div className="mb-8 flex gap-8 overflow-x-auto border-b border-[#dddddd]">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`-mb-px whitespace-nowrap border-b-2 pb-3 ${label} transition-colors ${
                  tab === entry.id
                    ? 'border-[#1c1b1b] text-[#1c1b1b]'
                    : 'border-transparent text-[#6a6a6a] hover:text-[#1c1b1b]'
                }`}
                aria-current={tab === entry.id ? 'page' : undefined}
              >
                {entry.text}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <section>
              <div className="mb-10 grid grid-cols-1 border border-[#dddddd] sm:grid-cols-3">
                {[
                  [String(orders.length), 'Orders'],
                  [formatMoney(String(totalSpent), currency), 'Total spent'],
                  [String(designs.length), 'Saved designs'],
                ].map(([value, text]) => (
                  <div key={text} className="border-b border-[#dddddd] px-6 py-5 text-center last:border-b-0 sm:border-b-0 sm:border-l sm:first:border-l-0">
                    <span className="block text-[22px] tracking-[0.08em]">{value}</span>
                    <span className={`mt-1 block ${label} text-[#6a6a6a]`}>{text}</span>
                  </div>
                ))}
              </div>

              <h2 className={`mb-4 border-b border-[#dddddd] pb-3 text-[14px] uppercase tracking-[0.2em]`}>
                Recent orders
              </h2>
              {orders.length === 0 ? (
                <div className="border border-[#dddddd] px-6 py-10 text-center">
                  <p className="mb-5 text-sm text-[#6a6a6a]">You haven’t placed any orders yet.</p>
                  <a
                    href={`${shopOrigin}/collections/all`}
                    className={`inline-block border border-[#1c1b1b] bg-[#1c1b1b] px-8 py-3 text-white ${label} hover:bg-white hover:text-[#1c1b1b]`}
                  >
                    Start shopping
                  </a>
                </div>
              ) : (
                <ul>
                  {orders.slice(0, 3).map((order) => (
                    <li key={order.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[#dddddd] py-3.5 text-sm first:border-t first:border-t-[#1c1b1b] sm:grid-cols-[90px_1fr_auto_auto]">
                      <span>{order.name}</span>
                      <span className="hidden text-[#6a6a6a] sm:block">{formatDate(order.processedAt)}</span>
                      <StatusBadge value={order.financialStatus} />
                      <span className="text-right">{formatMoney(order.totalAmount, order.totalCurrency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'orders' && (
            <section>
              <h2 className="mb-4 border-b border-[#dddddd] pb-3 text-[14px] uppercase tracking-[0.2em]">
                Order history
              </h2>
              {orders.length === 0 ? (
                <p className="text-sm text-[#6a6a6a]">No orders yet.</p>
              ) : (
                <ul>
                  {orders.map((order) => (
                    <li key={order.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[#dddddd] py-3.5 text-sm first:border-t first:border-t-[#1c1b1b] sm:grid-cols-[90px_1fr_auto_auto]">
                      {order.statusPageUrl ? (
                        <a href={order.statusPageUrl} className="underline underline-offset-4 hover:text-[#6a6a6a]">
                          {order.name}
                        </a>
                      ) : (
                        <span>{order.name}</span>
                      )}
                      <span className="hidden text-[#6a6a6a] sm:block">{formatDate(order.processedAt)}</span>
                      <StatusBadge value={order.financialStatus} />
                      <span className="text-right">{formatMoney(order.totalAmount, order.totalCurrency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'designs' && (
            <section>
              <h2 className="mb-4 border-b border-[#dddddd] pb-3 text-[14px] uppercase tracking-[0.2em]">
                My Designs
              </h2>
              {designs.length === 0 ? (
                <div className="bg-[#f7f7f7] px-6 py-12 text-center">
                  <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-[#6a6a6a]">
                    Your saved gi designs will live here. Create a custom gi in the configurator
                    and it will follow you home.
                  </p>
                  <a
                    href={`${shopOrigin}/collections/all`}
                    className={`inline-block border border-[#1c1b1b] bg-white px-8 py-3 text-[#1c1b1b] ${label} hover:bg-[#1c1b1b] hover:text-white`}
                  >
                    Design your gi
                  </a>
                </div>
              ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {designs.map((design) => (
                    <li key={design.id} className="border border-[#dddddd] p-3">
                      {design.thumbnailUrl ? (
                        <img src={design.thumbnailUrl} alt={design.name ?? 'Saved design'} className="mb-3 aspect-square w-full object-contain" />
                      ) : (
                        <div className="mb-3 flex aspect-square w-full items-center justify-center bg-[#f7f7f7] text-2xl text-[#dddddd]">D</div>
                      )}
                      <p className="truncate text-sm">{design.name ?? 'Untitled design'}</p>
                      <p className={`mt-0.5 ${label} text-[#6a6a6a]`}>{design.productHandle ?? ''}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
