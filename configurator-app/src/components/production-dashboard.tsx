import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Download, ExternalLink, RefreshCw, Search, Trash2 } from 'lucide-react';

interface ArtworkLink {
  part: string;
  slot: string;
  filename: string;
  url: string;
}

interface DashboardLogo extends ArtworkLink {
  designId?: string;
  designName: string;
  updatedAt: string;
}

interface StoredArtworkImage {
  dataUrl?: string;
  shopifyUrl?: string;
  filename?: string;
}

interface ProductionDesign {
  id: string;
  name: string;
  shopifyCustomerId: string | null;
  customerEmail: string | null;
  productHandle: string;
  thumbnailUrl: string | null;
  updatedAt: string;
  designUrl: string;
  netlifyDesignUrl?: string;
  productionUrl: string;
  artwork: ArtworkLink[];
  configData?: {
    images?: {
      kimono?: Record<string, StoredArtworkImage | undefined>;
      pant?: Record<string, StoredArtworkImage | undefined>;
    };
    spec?: {
      kimono?: {
        size?: string;
        colors?: Record<string, { name?: string | null; hex?: string }>;
      };
      belt?: {
        color?: { name?: string | null; hex?: string };
      };
      pant?: {
        size?: string;
        colors?: Record<string, { name?: string | null; hex?: string }>;
      };
    };
  };
}

interface DesignsResponse {
  data?: {
    designs?: ProductionDesign[];
    logos?: DashboardLogo[];
  };
}

function colorName(color?: { name?: string | null; hex?: string }) {
  return color?.name || color?.hex || 'None';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function designSummary(design: ProductionDesign) {
  const spec = design.configData?.spec;
  const kimono = spec?.kimono;
  const pant = spec?.pant;
  return [
    `Kimono ${kimono?.size ?? 'N/A'} ${colorName(kimono?.colors?.body)}`,
    `Belt ${colorName(spec?.belt?.color)}`,
    `Pant ${pant?.size ?? 'N/A'} ${colorName(pant?.colors?.body)}`,
  ].join(' / ');
}

export function ProductionDashboard() {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const isCustomerDashboard =
    typeof window !== 'undefined' &&
    window.location.pathname.replace(/\/+$/, '') === '/account/designs';
  const isLogoDashboard =
    typeof window !== 'undefined' &&
    window.location.pathname.replace(/\/+$/, '') === '/account/logos';
  const isCustomerArea = isCustomerDashboard || isLogoDashboard;
  const customerId = params.get('customerId');
  const customerEmail = params.get('customerEmail');
  const shopDomain = params.get('shop') || 'dspln';
  const [designs, setDesigns] = useState<ProductionDesign[]>([]);
  const [dashboardLogos, setDashboardLogos] = useState<DashboardLogo[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDesigns = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const apiParams = new URLSearchParams();
      if (isCustomerArea && customerId) {
        apiParams.set('ownerKey', `shopify:${shopDomain}:${customerId}`);
      } else {
        apiParams.set('all', '1');
      }
      if (isLogoDashboard) {
        apiParams.set('logos', '1');
        if (customerEmail) apiParams.set('customerEmail', customerEmail);
      }

      const response = await fetch(`/api/customer-designs?${apiParams}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as DesignsResponse;
      setDesigns(data.data?.designs ?? []);
      setDashboardLogos(data.data?.logos ?? []);
    } catch {
      setError('Could not load saved designs.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [customerEmail, customerId, isCustomerArea, isLogoDashboard, shopDomain]);

  useEffect(() => {
    void loadDesigns();
  }, [loadDesigns]);

  useEffect(() => {
    if (!isCustomerArea || typeof window === 'undefined') return;

    const refreshQuietly = () => {
      void loadDesigns(true);
    };
    const refreshOnVisible = () => {
      if (!document.hidden) refreshQuietly();
    };
    const refreshOnStorage = (event: StorageEvent) => {
      if (event.key === 'dspln:customer-designs:changed') {
        refreshQuietly();
      }
    };

    const interval = window.setInterval(refreshQuietly, 3000);
    window.addEventListener('focus', refreshQuietly);
    window.addEventListener('storage', refreshOnStorage);
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshQuietly);
      window.removeEventListener('storage', refreshOnStorage);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [isCustomerArea, loadDesigns]);

  async function deleteDesign(design: ProductionDesign) {
    const confirmed = window.confirm(`Delete "${design.name || 'Saved Gi Design'}"?`);
    if (!confirmed) return;

    setDeletingId(design.id);
    setError('');
    try {
      const deleteParams = new URLSearchParams({ id: design.id });
      if (isCustomerArea && customerId) {
        deleteParams.set('ownerKey', `shopify:${shopDomain}:${customerId}`);
      }

      const response = await fetch(`/api/customer-designs?${deleteParams}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(await response.text());
      setDesigns((current) =>
        current.filter((savedDesign) => savedDesign.id !== design.id),
      );
    } catch {
      setError('Could not delete saved design.');
    } finally {
      setDeletingId(null);
    }
  }

  const visibleDesigns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return designs;
    return designs.filter((design) =>
      [
        design.id,
        design.name,
        design.customerEmail,
        design.productHandle,
        designSummary(design),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [designs, query]);

  const visibleLogos = useMemo(() => {
    const logos = new Map<string, DashboardLogo>();
    dashboardLogos.forEach((logo) => {
      const key = `${logo.filename}|${logo.url}`;
      if (!logos.has(key)) logos.set(key, logo);
    });

    designs.forEach((design) => {
      design.artwork.forEach((art) => {
        const key = `${art.filename}|${art.url}`;
        if (!logos.has(key)) {
          logos.set(key, {
            ...art,
            designName: design.name || 'Saved Gi Design',
            updatedAt: design.updatedAt,
          });
        }
      });

      Object.entries(design.configData?.images?.kimono ?? {}).forEach(
        ([slot, image]) => {
          const url = image?.shopifyUrl || image?.dataUrl;
          if (!url) return;
          const filename = image?.filename || `kimono-${slot}.png`;
          const key = `${filename}|${url}`;
          if (!logos.has(key)) {
            logos.set(key, {
              part: 'kimono',
              slot,
              filename,
              url,
              designName: design.name || 'Saved Gi Design',
              updatedAt: design.updatedAt,
            });
          }
        },
      );

      Object.entries(design.configData?.images?.pant ?? {}).forEach(
        ([slot, image]) => {
          const url = image?.shopifyUrl || image?.dataUrl;
          if (!url) return;
          const filename = image?.filename || `pant-${slot}.png`;
          const key = `${filename}|${url}`;
          if (!logos.has(key)) {
            logos.set(key, {
              part: 'pant',
              slot,
              filename,
              url,
              designName: design.name || 'Saved Gi Design',
              updatedAt: design.updatedAt,
            });
          }
        },
      );
    });

    const list = [...logos.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((logo) =>
      [logo.filename, logo.part, logo.slot, logo.designName]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [dashboardLogos, designs, query]);

  return (
    <main className="min-h-screen bg-white text-[#1c1b1b]">
      <header className="border-b border-[#dedede] px-6 py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs tracking-[0.26em] text-[#7b7b7b] uppercase">
              {isCustomerArea ? 'DSPLN Account' : 'DSPLN Production'}
            </p>
            <h1 className="mt-2 text-2xl font-medium tracking-[0.18em] uppercase">
              {isLogoDashboard
                ? 'Uploaded Logos'
                : isCustomerDashboard
                  ? 'My Designs'
                  : 'Saved Designs'}
            </h1>
            {isCustomerArea ? (
              <p className="mt-2 text-sm text-[#666]">
                {customerEmail ||
                  (isLogoDashboard
                    ? 'Your uploaded DSPLN artwork'
                    : 'Your saved custom gi designs')}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void loadDesigns()}
            className="flex h-10 items-center justify-center gap-2 border border-[#d8d8d8] px-4 text-xs font-semibold tracking-[0.16em] uppercase"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-6">
        <label className="flex max-w-xl items-center gap-3 border border-[#d8d8d8] px-4 py-3">
          <Search className="h-4 w-4 text-[#777]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              isCustomerDashboard
                ? 'Search your saved designs'
                : isLogoDashboard
                  ? 'Search your uploaded logos'
                : 'Search design, customer, color, size'
            }
            className="w-full border-0 bg-transparent text-sm outline-none"
          />
        </label>

        {error ? <p className="mt-6 text-sm text-[#842323]">{error}</p> : null}
        {!loading && !error && (isLogoDashboard ? visibleLogos.length : visibleDesigns.length) === 0 ? (
          <div className="mt-12 border border-[#e3e3e3] px-6 py-12 text-center">
            <Box className="mx-auto h-8 w-8 text-[#777]" />
            <p className="mt-4 text-sm tracking-[0.16em] uppercase">
              {isLogoDashboard
                ? 'No uploaded logos yet'
                : isCustomerDashboard
                  ? 'No saved designs yet'
                  : 'No saved designs found'}
            </p>
          </div>
        ) : null}

        {isLogoDashboard ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleLogos.map((logo) => (
              <article
                key={`${logo.filename}-${logo.url}`}
                className="border border-[#dedede] p-4"
              >
                <div className="flex aspect-[4/3] items-center justify-center bg-[#fafafa]">
                  <img
                    src={logo.url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <h2 className="mt-4 truncate text-sm font-semibold tracking-[0.12em] uppercase">
                  {logo.filename}
                </h2>
                <p className="mt-2 text-xs tracking-[0.12em] text-[#777] uppercase">
                  {logo.part} / {logo.slot}
                </p>
                <p className="mt-2 text-sm text-[#666]">{logo.designName}</p>
                <a
                  href={logo.url}
                  className="mt-4 flex h-10 items-center justify-center gap-2 border border-[#d8d8d8] px-4 text-xs font-semibold tracking-[0.16em] uppercase"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </article>
            ))}
          </div>
        ) : (
        <div className="mt-6 grid gap-5">
          {visibleDesigns.map((design) => (
            <article
              key={design.id}
              className="grid gap-5 border border-[#dedede] p-4 md:grid-cols-[180px_1fr_280px]"
            >
              <div className="flex min-h-64 items-center justify-center bg-[#fafafa]">
                {design.thumbnailUrl ? (
                  <img
                    src={design.thumbnailUrl}
                    alt=""
                    className="max-h-64 w-full object-contain"
                  />
                ) : (
                  <Box className="h-8 w-8 text-[#999]" />
                )}
              </div>

              <div>
                <h2 className="text-sm font-semibold tracking-[0.16em] uppercase">
                  {design.name || 'Saved Gi Design'}
                </h2>
                <p className="mt-2 text-xs tracking-[0.12em] text-[#666] uppercase">
                  {design.id}
                </p>
                <dl className="mt-5 grid gap-2 text-sm">
                  <div>
                    <dt className="text-xs tracking-[0.16em] text-[#999] uppercase">
                  {isCustomerDashboard ? 'Owner' : 'Customer'}
                    </dt>
                    <dd>{design.customerEmail || design.shopifyCustomerId || 'Guest / unknown'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs tracking-[0.16em] text-[#999] uppercase">
                      Updated
                    </dt>
                    <dd>{formatDate(design.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs tracking-[0.16em] text-[#999] uppercase">
                      Configuration
                    </dt>
                    <dd>{designSummary(design)}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-col gap-3">
                <a
                  href={design.designUrl}
                  target="_top"
                  className="flex h-10 items-center justify-center gap-2 bg-[#1c1b1b] px-4 text-xs font-semibold tracking-[0.16em] text-white uppercase"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open 3D
                </a>
                <a
                  href={design.productionUrl}
                  className="flex h-10 items-center justify-center gap-2 border border-[#d8d8d8] px-4 text-xs font-semibold tracking-[0.16em] uppercase"
                >
                  <ExternalLink className="h-4 w-4" />
                  {isCustomerDashboard ? 'Details' : 'Packet'}
                </a>
                {!isCustomerDashboard ? (
                <div className="mt-2 border-t border-[#dedede] pt-3">
                  <p className="text-xs tracking-[0.18em] text-[#777] uppercase">
                    Artwork
                  </p>
                  {design.artwork.length ? (
                    <div className="mt-2 grid gap-2">
                      {design.artwork.map((art) => (
                        <a
                          key={`${design.id}-${art.part}-${art.slot}`}
                          href={art.url}
                          className="flex items-center gap-2 text-sm underline underline-offset-4"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {art.slot} · {art.filename}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[#777]">No uploaded artwork.</p>
                  )}
                </div>
                ) : null}
                {isCustomerDashboard ? (
                  <button
                    type="button"
                    onClick={() => void deleteDesign(design)}
                    disabled={deletingId === design.id}
                    className="flex h-10 items-center justify-center gap-2 border border-[#d8d8d8] px-4 text-xs font-semibold tracking-[0.16em] uppercase text-[#842323] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingId === design.id ? 'Deleting' : 'Delete'}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        )}
      </section>
    </main>
  );
}
