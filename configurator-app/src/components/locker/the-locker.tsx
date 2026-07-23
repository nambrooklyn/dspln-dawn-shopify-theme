/**
 * The Locker — DSPLN's customer dashboard.
 *
 * The customer-facing Locker is embedded by the Shopify storefront at
 * /pages/locker. Shopify owns authentication and passes the signed-in
 * customer identity to this app. The app then joins that identity to DSPLN's
 * saved designs, uploaded artwork, fit profile, and Shopify order history.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type LockerPage = 'designs' | 'uploads' | 'fit' | 'orders';

interface LockerCustomer {
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  shopDomain: string;
  storefrontOrigin: string;
}

interface LockerOrder {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string;
  fulfillmentStatus: string;
  totalAmount: string;
  totalCurrency: string;
  statusPageUrl: string;
}

interface LockerDesign {
  id: string;
  name?: string;
  productHandle?: string;
  thumbnailUrl?: string | null;
  updatedAt?: string;
}

interface LockerUpload {
  url: string;
  filename?: string;
  designId?: string;
  designName?: string;
  updatedAt?: string;
  part?: string;
  slot?: string;
}

interface FitProfile {
  units: 'imperial' | 'metric';
  height: string;
  weight: string;
  chest: string;
  waist: string;
  hips: string;
  inseam: string;
  shoulder: string;
  sleeve: string;
  preferredGiSize: string;
  fitPreference: 'slim' | 'regular' | 'relaxed';
  notes: string;
  updatedAt?: string;
}

const emptyFit: FitProfile = {
  units: 'imperial',
  height: '',
  weight: '',
  chest: '',
  waist: '',
  hips: '',
  inseam: '',
  shoulder: '',
  sleeve: '',
  preferredGiSize: '',
  fitPreference: 'regular',
  notes: '',
};

const label = 'text-[11px] uppercase tracking-[0.16em]';

function queryCustomer(): LockerCustomer | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const customerId = params.get('customerId')?.trim() ?? '';
  const email = params.get('customerEmail')?.trim() ?? '';
  const shopDomain = params.get('shop')?.trim() ?? '';
  if (!customerId || !shopDomain) return null;
  return {
    customerId,
    email,
    shopDomain,
    firstName: params.get('firstName')?.trim() ?? '',
    lastName: params.get('lastName')?.trim() ?? '',
    storefrontOrigin:
      params.get('storefrontOrigin')?.trim() ||
      (document.referrer ? new URL(document.referrer).origin : 'https://dspln.com'),
  };
}

function ownerKey(customer: LockerCustomer): string {
  return `shopify:${customer.shopDomain}:${customer.customerId}`;
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMoney(amount: string, currency: string): string {
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) return `${amount} ${currency}`.trim();
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(numeric);
}

async function fetchDesigns(customer: LockerCustomer): Promise<LockerDesign[]> {
  const url = new URL('/api/customer-designs', window.location.origin);
  url.searchParams.set('ownerKey', ownerKey(customer));
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load saved designs.');
  const payload = await response.json();
  return payload?.data?.designs ?? [];
}

async function fetchUploads(customer: LockerCustomer): Promise<LockerUpload[]> {
  const url = new URL('/api/customer-designs', window.location.origin);
  url.searchParams.set('ownerKey', ownerKey(customer));
  url.searchParams.set('logos', '1');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load uploaded artwork.');
  const payload = await response.json();
  const uploads: LockerUpload[] = payload?.data?.logos ?? [];
  const seen = new Set<string>();
  return uploads.filter((upload) => {
    const key = `${upload.url}|${upload.filename ?? ''}`;
    if (!upload.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchFit(customer: LockerCustomer): Promise<FitProfile> {
  const url = new URL('/api/customer-fit', window.location.origin);
  url.searchParams.set('ownerKey', ownerKey(customer));
  const response = await fetch(url);
  if (response.status === 404) return emptyFit;
  if (!response.ok) throw new Error('Could not load your sizing profile.');
  const payload = await response.json();
  return { ...emptyFit, ...(payload?.data?.profile ?? {}) };
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex border border-[#d7d7d7] px-3 py-1 ${label}`}>
      {(value || 'Pending').replaceAll('_', ' ')}
    </span>
  );
}

export function TheLocker() {
  const customer = useMemo(queryCustomer, []);
  const [page, setPage] = useState<LockerPage>('designs');
  const [designs, setDesigns] = useState<LockerDesign[]>([]);
  const [uploads, setUploads] = useState<LockerUpload[]>([]);
  const [orders, setOrders] = useState<LockerOrder[]>([]);
  const [fit, setFit] = useState<FitProfile>(emptyFit);
  const [loading, setLoading] = useState(Boolean(customer));
  const [savingFit, setSavingFit] = useState(false);
  const [error, setError] = useState('');

  const loadLocker = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      fetchDesigns(customer),
      fetchUploads(customer),
      fetchFit(customer),
    ]);
    if (results[0].status === 'fulfilled') setDesigns(results[0].value);
    if (results[1].status === 'fulfilled') setUploads(results[1].value);
    if (results[2].status === 'fulfilled') setFit(results[2].value);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      setError(failure.reason instanceof Error ? failure.reason.message : 'Could not load the Locker.');
    }
    setLoading(false);
  }, [customer]);

  useEffect(() => {
    void loadLocker();
  }, [loadLocker]);

  useEffect(() => {
    const receiveStorefrontContext = (event: MessageEvent) => {
      if (!customer || event.origin !== customer.storefrontOrigin) return;
      const data = event.data;
      if (data?.type !== 'dspln:locker:context') return;
      if (String(data.customerId) !== customer.customerId) return;
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    };
    window.addEventListener('message', receiveStorefrontContext);
    window.parent?.postMessage({ type: 'dspln:locker:ready' }, customer?.storefrontOrigin ?? '*');
    return () => window.removeEventListener('message', receiveStorefrontContext);
  }, [customer]);

  const saveFit = async () => {
    if (!customer) return;
    setSavingFit(true);
    try {
      const response = await fetch('/api/customer-fit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerKey: ownerKey(customer), profile: fit }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not save your sizing profile.');
      setFit({ ...fit, updatedAt: payload?.data?.profile?.updatedAt });
      toast.success('Sizing and fit profile saved');
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setSavingFit(false);
    }
  };

  if (!customer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-7 bg-white px-6 text-center font-sans text-[#1c1b1b]">
        <div className="flex h-14 w-14 items-center justify-center bg-[#1c1b1b] text-2xl text-white">D</div>
        <div>
          <h1 className="text-2xl uppercase tracking-[0.24em]">The Locker</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[#666]">
            Open The Locker from the DSPLN store to sign in and access your designs, uploads,
            sizing profile, and orders.
          </p>
        </div>
        <a
          href="https://dspln.com/pages/locker"
          className={`border border-[#1c1b1b] bg-[#1c1b1b] px-9 py-4 text-white ${label}`}
        >
          Open DSPLN Locker
        </a>
      </main>
    );
  }

  const initials =
    `${customer.firstName.slice(0, 1)}${customer.lastName.slice(0, 1)}`.toUpperCase() || 'D';
  const displayName =
    [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email;
  const nav: Array<{ id: LockerPage; text: string }> = [
    { id: 'designs', text: 'Designs' },
    { id: 'uploads', text: 'Uploads' },
    { id: 'fit', text: 'Sizing / Fit' },
    { id: 'orders', text: 'Orders' },
  ];

  return (
    <div className="min-h-screen bg-white font-sans text-[#1c1b1b]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[84px_300px_minmax(0,1fr)]">
        <nav className="flex items-center justify-around bg-[#1c1b1b] px-2 py-2 lg:min-h-screen lg:flex-col lg:justify-start lg:py-6">
          <a
            href={customer.storefrontOrigin}
            target="_top"
            className="flex h-9 w-9 items-center justify-center border border-white/40 text-white lg:mb-6"
          >
            D
          </a>
          {nav.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setPage(entry.id)}
              className={`w-full px-2 py-3 text-center ${label} ${
                page === entry.id ? 'text-white' : 'text-[#aaa] hover:text-white'
              }`}
            >
              {entry.text}
            </button>
          ))}
          <a
            href={customer.storefrontOrigin}
            target="_top"
            className={`mt-auto hidden w-full px-2 py-3 text-center text-[#aaa] hover:text-white lg:block ${label}`}
          >
            Back to store
          </a>
        </nav>

        <aside className="bg-[#f5f5f5] px-7 py-8 text-center lg:min-h-screen">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#1c1b1b] text-xl tracking-[0.12em] text-white">
            {initials}
          </div>
          <p className="mt-5 text-[15px] uppercase tracking-[0.08em]">{displayName}</p>
          <p className="mt-1 break-all text-[13px] text-[#666]">{customer.email}</p>
          <div className="mt-7 border-t border-[#d8d8d8] pt-6">
            <p className={`${label} mb-2`}>Member of DSPLN</p>
            <p className="text-[13px] leading-relaxed text-[#666]">
              {designs.length} design{designs.length === 1 ? '' : 's'} · {uploads.length} upload
              {uploads.length === 1 ? '' : 's'} · {orders.length} order
              {orders.length === 1 ? '' : 's'}
            </p>
          </div>
        </aside>

        <main className="min-w-0 px-5 py-8 lg:px-12">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[#ddd] pb-5">
            <div>
              <p className={`${label} text-[#777]`}>The Locker</p>
              <h1 className="mt-2 text-xl uppercase tracking-[0.2em]">
                {nav.find((entry) => entry.id === page)?.text}
              </h1>
            </div>
            {error ? <p className="text-sm text-[#842323]">{error}</p> : null}
          </div>

          {loading ? <p className={`${label} py-12 text-center text-[#777]`}>Loading Locker…</p> : null}

          {!loading && page === 'designs' ? (
            <section>
              {designs.length ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {designs.map((design) => {
                    const designUrl = new URL(
                      `/products/${design.productHandle || 'customgi'}`,
                      customer.storefrontOrigin,
                    );
                    designUrl.searchParams.set('design', design.id);
                    return (
                      <article key={design.id} className="border border-[#ddd] bg-white">
                        <div className="aspect-square bg-[#f7f7f7]">
                          {design.thumbnailUrl ? (
                            <img
                              src={design.thumbnailUrl}
                              alt={design.name || 'Saved design'}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className={`flex h-full items-center justify-center text-[#999] ${label}`}>
                              Preview pending
                            </div>
                          )}
                        </div>
                        <div className="p-5">
                          <h2 className="text-sm uppercase tracking-[0.12em]">
                            {design.name || 'Saved Design'}
                          </h2>
                          <p className="mt-2 text-xs text-[#777]">
                            Last edited {formatDate(design.updatedAt)}
                          </p>
                          <a
                            href={designUrl.toString()}
                            target="_top"
                            className={`mt-5 inline-flex border border-[#1c1b1b] bg-[#1c1b1b] px-5 py-3 text-white ${label}`}
                          >
                            Open in 3D
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-[#ddd] px-6 py-14 text-center">
                  <p className="text-sm text-[#666]">You haven’t saved a design yet.</p>
                  <a
                    href={`${customer.storefrontOrigin}/products/customgi`}
                    target="_top"
                    className={`mt-6 inline-flex border border-[#1c1b1b] bg-[#1c1b1b] px-7 py-3 text-white ${label}`}
                  >
                    Design a Gi
                  </a>
                </div>
              )}
            </section>
          ) : null}

          {!loading && page === 'uploads' ? (
            <section>
              <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[#666]">
                Artwork uploaded with your saved configurator designs is kept here for reuse and
                production reference.
              </p>
              {uploads.length ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {uploads.map((upload, index) => (
                    <article key={`${upload.url}-${index}`} className="border border-[#ddd] p-4">
                      <div className="aspect-square bg-[#f7f7f7]">
                        <img
                          src={upload.url}
                          alt={upload.filename || 'Uploaded artwork'}
                          className="h-full w-full object-contain p-3"
                        />
                      </div>
                      <h2 className="mt-4 truncate text-sm">{upload.filename || 'Uploaded artwork'}</h2>
                      <p className="mt-1 text-xs text-[#777]">
                        {upload.designName || 'Saved design'}
                        {upload.slot ? ` · ${upload.slot.replaceAll('-', ' ')}` : ''}
                      </p>
                      <a
                        href={upload.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`mt-4 inline-flex underline underline-offset-4 ${label}`}
                      >
                        Open artwork
                      </a>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="border border-[#ddd] px-6 py-14 text-center text-sm text-[#666]">
                  Uploaded logos from saved designs will appear here.
                </div>
              )}
            </section>
          ) : null}

          {!loading && page === 'fit' ? (
            <form
              className="max-w-4xl"
              onSubmit={(event) => {
                event.preventDefault();
                void saveFit();
              }}
            >
              <p className="mb-7 max-w-2xl text-sm leading-relaxed text-[#666]">
                Save your measurements once so future sizing recommendations and custom orders can
                use the same fit profile.
              </p>
              <div className="mb-6 flex gap-2">
                {(['imperial', 'metric'] as const).map((units) => (
                  <button
                    key={units}
                    type="button"
                    onClick={() => setFit({ ...fit, units })}
                    className={`border px-5 py-2 ${label} ${
                      fit.units === units
                        ? 'border-[#1c1b1b] bg-[#1c1b1b] text-white'
                        : 'border-[#ccc]'
                    }`}
                  >
                    {units === 'imperial' ? 'Inches / Pounds' : 'Centimeters / Kilograms'}
                  </button>
                ))}
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['height', 'Height'],
                  ['weight', 'Weight'],
                  ['chest', 'Chest'],
                  ['waist', 'Waist'],
                  ['hips', 'Hips'],
                  ['inseam', 'Inseam'],
                  ['shoulder', 'Shoulder width'],
                  ['sleeve', 'Sleeve length'],
                  ['preferredGiSize', 'Preferred Gi size'],
                ].map(([key, text]) => (
                  <label key={key} className={label}>
                    {text}
                    <input
                      value={String(fit[key as keyof FitProfile] ?? '')}
                      onChange={(event) => setFit({ ...fit, [key]: event.target.value })}
                      className="mt-2 h-11 w-full border border-[#ccc] px-3 text-sm normal-case tracking-normal outline-none focus:border-[#1c1b1b]"
                    />
                  </label>
                ))}
                <label className={label}>
                  Fit preference
                  <select
                    value={fit.fitPreference}
                    onChange={(event) =>
                      setFit({ ...fit, fitPreference: event.target.value as FitProfile['fitPreference'] })
                    }
                    className="mt-2 h-11 w-full border border-[#ccc] bg-white px-3 text-sm normal-case tracking-normal"
                  >
                    <option value="slim">Slim</option>
                    <option value="regular">Regular</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </label>
              </div>
              <label className={`mt-5 block ${label}`}>
                Fit notes
                <textarea
                  value={fit.notes}
                  onChange={(event) => setFit({ ...fit, notes: event.target.value })}
                  rows={4}
                  className="mt-2 w-full border border-[#ccc] p-3 text-sm normal-case tracking-normal outline-none focus:border-[#1c1b1b]"
                  placeholder="Examples: longer sleeves, room through shoulders, competition fit…"
                />
              </label>
              <button
                type="submit"
                disabled={savingFit}
                className={`mt-6 border border-[#1c1b1b] bg-[#1c1b1b] px-8 py-3 text-white ${label} disabled:opacity-50`}
              >
                {savingFit ? 'Saving…' : 'Save sizing profile'}
              </button>
              {fit.updatedAt ? (
                <p className="mt-3 text-xs text-[#777]">Last updated {formatDate(fit.updatedAt)}</p>
              ) : null}
            </form>
          ) : null}

          {!loading && page === 'orders' ? (
            <section>
              {orders.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                    <thead>
                      <tr className={`border-b border-[#1c1b1b] ${label}`}>
                        <th className="py-3 pr-4 font-normal">Order</th>
                        <th className="py-3 pr-4 font-normal">Date</th>
                        <th className="py-3 pr-4 font-normal">Payment</th>
                        <th className="py-3 pr-4 font-normal">Fulfillment</th>
                        <th className="py-3 font-normal">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="border-b border-[#ddd]">
                          <td className="py-4 pr-4">
                            <a href={order.statusPageUrl} target="_top" className="underline">
                              {order.name}
                            </a>
                          </td>
                          <td className="py-4 pr-4">{formatDate(order.processedAt)}</td>
                          <td className="py-4 pr-4"><StatusBadge value={order.financialStatus} /></td>
                          <td className="py-4 pr-4"><StatusBadge value={order.fulfillmentStatus} /></td>
                          <td className="py-4">
                            {formatMoney(order.totalAmount, order.totalCurrency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border border-[#ddd] px-6 py-14 text-center">
                  <p className="text-sm text-[#666]">You haven’t placed any orders yet.</p>
                  <a
                    href={`${customer.storefrontOrigin}/collections/all`}
                    target="_top"
                    className={`mt-6 inline-flex border border-[#1c1b1b] bg-[#1c1b1b] px-7 py-3 text-white ${label}`}
                  >
                    Start shopping
                  </a>
                </div>
              )}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
