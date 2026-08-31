import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

interface CustomerRecord {
  ownerKey: string;
  customerId: string;
  shopDomain: string;
  email: string;
  firstName: string;
  lastName: string;
  lastLockerVisitAt?: string;
  orders?: Array<Record<string, string>>;
}

interface DesignRecord {
  id: string;
  name?: string;
  productHandle?: string;
  thumbnailUrl?: string;
  updatedAt?: string;
}

interface UploadRecord {
  url: string;
  filename?: string;
  designName?: string;
  slot?: string;
}

type CustomerData = {
  designs: DesignRecord[];
  uploads: UploadRecord[];
  fit: Record<string, string> | null;
};

const emptyData: CustomerData = { designs: [], uploads: [], fit: null };

function date(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function AdminLocker() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('dspln.admin.key') ?? '');
  const [keyDraft, setKeyDraft] = useState(adminKey);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [selected, setSelected] = useState<CustomerRecord | null>(null);
  const [data, setData] = useState<CustomerData>(emptyData);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const adminFetch = useCallback(
    (url: string) => fetch(url, { headers: { 'x-dspln-admin-key': adminKey } }),
    [adminKey],
  );

  const loadCustomers = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch('/api/locker-customers');
      if (!response.ok) throw new Error('The admin key was not accepted.');
      const payload = await response.json();
      setCustomers(payload?.data?.customers ?? []);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, adminKey]);

  useEffect(() => {
    if (adminKey) void loadCustomers();
  }, [adminKey, loadCustomers]);

  const openCustomer = async (customer: CustomerRecord) => {
    setSelected(customer);
    setData(emptyData);
    setLoading(true);
    const owner = encodeURIComponent(customer.ownerKey);
    try {
      const [customerResponse, designResponse, uploadResponse, fitResponse] = await Promise.all([
        adminFetch(`/api/locker-customers?ownerKey=${owner}`),
        fetch(`/api/customer-designs?ownerKey=${owner}`),
        fetch(`/api/customer-designs?ownerKey=${owner}&logos=1`),
        fetch(`/api/customer-fit?ownerKey=${owner}`),
      ]);
      const refreshedCustomer = customerResponse.ok ? await customerResponse.json() : {};
      const completeCustomer = refreshedCustomer?.data?.customer;
      if (completeCustomer) setSelected(completeCustomer);
      const designs = designResponse.ok ? await designResponse.json() : {};
      const uploads = uploadResponse.ok ? await uploadResponse.json() : {};
      const fit = fitResponse.ok ? await fitResponse.json() : {};
      setData({
        designs: designs?.data?.designs ?? [],
        uploads: uploads?.data?.logos ?? [],
        fit: fit?.data?.profile ?? null,
      });
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) =>
      `${customer.firstName} ${customer.lastName} ${customer.email} ${customer.customerId}`
        .toLowerCase()
        .includes(needle),
    );
  }, [customers, query]);

  if (!adminKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] p-6 text-[#1c1b1b]">
        <form
          className="w-full max-w-sm border border-[#ddd] bg-white p-8"
          onSubmit={(event) => {
            event.preventDefault();
            const clean = keyDraft.trim();
            if (!clean) return;
            sessionStorage.setItem('dspln.admin.key', clean);
            setAdminKey(clean);
          }}
        >
          <p className="text-xs uppercase tracking-[0.18em]">DSPLN Internal</p>
          <h1 className="mt-3 text-xl uppercase tracking-[0.14em]">Admin Locker</h1>
          <label className="mt-7 block text-xs uppercase tracking-[0.14em]">
            Admin access key
            <input
              type="password"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              className="mt-2 h-12 w-full border border-[#bbb] px-3 text-sm normal-case tracking-normal"
            />
          </label>
          <button className="mt-5 w-full bg-[#1c1b1b] px-5 py-4 text-xs uppercase tracking-[0.16em] text-white">
            Open Admin Locker
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#1c1b1b]">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-[#1c1b1b] px-6 py-5 text-white">
        <div><p className="text-[10px] uppercase tracking-[0.2em]">DSPLN Internal</p><h1 className="mt-1 text-lg uppercase tracking-[0.16em]">Admin Locker</h1></div>
        <div className="flex gap-3">
          <button onClick={() => void loadCustomers()} className="border border-white/40 px-4 py-2 text-xs uppercase tracking-[0.12em]">Refresh</button>
          <button onClick={() => { sessionStorage.removeItem('dspln.admin.key'); setAdminKey(''); }} className="px-4 py-2 text-xs uppercase tracking-[0.12em] text-[#bbb]">Lock</button>
        </div>
      </header>
      <div className="grid min-h-[calc(100vh-76px)] lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r border-[#ddd] bg-[#f5f5f5] p-5">
          <div className="flex items-center border border-[#ccc] bg-white px-3"><Search className="h-4 w-4 text-[#777]"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers" className="h-11 min-w-0 flex-1 px-3 text-sm outline-none"/></div>
          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
          {!customers.length && !loading ? <button onClick={() => void loadCustomers()} className="mt-5 w-full bg-[#1c1b1b] px-4 py-3 text-xs uppercase tracking-[0.14em] text-white">Load customers</button> : null}
          <div className="mt-4 divide-y divide-[#ddd]">
            {visible.map((customer) => (
              <button key={customer.ownerKey} onClick={() => void openCustomer(customer)} className={`w-full px-2 py-4 text-left ${selected?.ownerKey === customer.ownerKey ? 'bg-white' : ''}`}>
                <p className="text-sm uppercase tracking-[0.08em]">{customer.firstName} {customer.lastName}</p>
                <p className="mt-1 truncate text-xs text-[#666]">{customer.email}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[#888]">{customer.orders?.length ?? 0} orders · Last visit {date(customer.lastLockerVisitAt)}</p>
              </button>
            ))}
          </div>
        </aside>
        <main className="min-w-0 p-6 lg:p-10">
          {!selected ? <div className="border border-dashed border-[#ccc] p-12 text-center text-sm text-[#666]">Choose a customer to view their complete Locker.</div> : (
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em]">Customer Locker</p>
              <h2 className="mt-2 text-2xl uppercase tracking-[0.12em]">{selected.firstName} {selected.lastName}</h2>
              <p className="mt-2 text-sm text-[#666]">{selected.email} · Shopify customer {selected.customerId}</p>
              {loading ? <p className="mt-8 text-sm">Loading customer records…</p> : (
                <div className="mt-8 space-y-10">
                  <section><h3 className="border-b border-[#ddd] pb-3 text-xs uppercase tracking-[0.16em]">Sizing / Fit</h3>{data.fit ? <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data.fit).map(([key,value]) => <div key={key}><dt className="text-[10px] uppercase tracking-[0.12em] text-[#777]">{key.replace(/([A-Z])/g,' $1')}</dt><dd className="mt-1 text-sm">{value || '—'}</dd></div>)}</dl> : <p className="mt-4 text-sm text-[#777]">No measurements saved.</p>}</section>
                  <section><h3 className="border-b border-[#ddd] pb-3 text-xs uppercase tracking-[0.16em]">Designs ({data.designs.length})</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.designs.map((design) => <article key={design.id} className="border border-[#ddd] p-4">{design.thumbnailUrl ? <img src={design.thumbnailUrl} alt="" className="aspect-square w-full object-contain"/> : null}<p className="mt-3 text-sm">{design.name || 'Saved design'}</p><a href={`https://${selected.shopDomain}/products/${design.productHandle || 'customgi'}?design=${design.id}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs uppercase tracking-[0.12em] underline">Open in 3D</a></article>)}</div></section>
                  <section><h3 className="border-b border-[#ddd] pb-3 text-xs uppercase tracking-[0.16em]">Uploads ({data.uploads.length})</h3><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">{data.uploads.map((upload,index) => <a key={`${upload.url}-${index}`} href={upload.url} target="_blank" rel="noreferrer" className="border border-[#ddd] p-2"><img src={upload.url} alt={upload.filename || ''} className="aspect-square w-full object-contain"/><p className="mt-2 truncate text-xs">{upload.filename}</p></a>)}</div></section>
                  <section><h3 className="border-b border-[#ddd] pb-3 text-xs uppercase tracking-[0.16em]">Orders ({selected.orders?.length ?? 0})</h3><div className="mt-4 divide-y divide-[#ddd]">{selected.orders?.map((order) => <div key={order.id} className="grid gap-2 py-4 text-sm sm:grid-cols-4"><span>{order.name}</span><span>{date(order.processedAt)}</span><span>{order.fulfillmentStatus || 'Unfulfilled'}</span><span>{order.totalAmount} {order.totalCurrency}</span></div>)}</div></section>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
