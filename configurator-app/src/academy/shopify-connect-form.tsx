// Ported from b2b-platform apps/user/src/components/onboarding/shopify/
// shopify-connect-form.tsx. The button records the academy's store for now;
// the OAuth install it started in the B2B app lands in Phase 2 and plugs in
// behind the same button.
import { memo, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BarChart3, Globe, Package, RefreshCw, Shield, Store, Zap } from 'lucide-react';

import { Button, FieldLabel, FieldMessage, Input } from './ui';

const features = [
  { icon: Package, title: 'Product Sync', description: 'Automatically sync your designs as Shopify products' },
  { icon: RefreshCw, title: 'Order Automation', description: 'Orders flow directly to DSPLN for production automatically' },
  { icon: BarChart3, title: 'Real-time Updates', description: 'Order status and tracking synced in real-time' },
  { icon: Shield, title: 'Secure Connection', description: 'OAuth 2.0 authentication with encrypted tokens' },
];

interface ShopifyConnectFormProps {
  isConnecting: boolean;
  error?: string;
  onConnect: (shopDomain: string) => void;
  onHostedSite: () => void;
  onSkip: () => void;
}

function ShopifyConnectForm({ isConnecting, error, onConnect, onHostedSite, onSkip }: ShopifyConnectFormProps) {
  const [showDomain, setShowDomain] = useState(false);
  const [shopDomain, setShopDomain] = useState('');
  const [fieldError, setFieldError] = useState('');

  const submitDomain = (event: FormEvent) => {
    event.preventDefault();
    const value = shopDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const domain = value && !value.includes('.') ? `${value}.myshopify.com` : value;
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
      setFieldError('Enter your myshopify.com address, e.g. your-academy.myshopify.com');
      return;
    }
    setFieldError('');
    onConnect(domain);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <div className="mb-6 flex justify-center">
          <div className="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-2xl">
            <Store className="text-primary h-8 w-8" />
          </div>
        </div>

        <h2 className="font-inter text-foreground mb-3 text-3xl font-bold">Connect Your Shopify Store</h2>
        <p className="font-albert text-muted-foreground mb-8 text-lg">
          Link your Shopify store to start publishing products and receiving orders automatically.
        </p>

        <motion.div
          className="border-border bg-card mb-8 rounded-xl border p-6 shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="mb-6 text-center">
            <h3 className="font-inter text-foreground mb-2 text-xl font-semibold">Why Connect Shopify?</h3>
            <p className="font-albert text-muted-foreground text-sm">
              Seamlessly integrate your academy's products with your Shopify store for automated order processing.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
              >
                <div className="bg-primary/10 mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg">
                  <feature.icon className="text-primary h-6 w-6" />
                </div>
                <h4 className="font-inter text-foreground mb-1 text-sm font-medium">{feature.title}</h4>
                <p className="font-albert text-muted-foreground text-xs leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="space-y-6"
        >
          {!showDomain ? (
            <Button onClick={() => setShowDomain(true)} disabled={isConnecting} size="lg" className="h-12 min-w-64 font-semibold shadow-sm">
              <Zap className="mr-2 h-5 w-5" />
              Connect Shopify Store
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          ) : (
            <form onSubmit={submitDomain} className="mx-auto max-w-md text-left" noValidate>
              <FieldLabel htmlFor="shop-domain">Your Shopify store address</FieldLabel>
              <div className="flex gap-3">
                <Input
                  id="shop-domain"
                  placeholder="your-academy.myshopify.com"
                  autoFocus
                  className="focus:border-primary focus:ring-primary/20 h-12 rounded-xl border-gray-200 bg-gray-50/50 text-sm focus:bg-white focus:ring-2"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                />
                <Button type="submit" disabled={isConnecting} size="lg" className="h-12 font-semibold shadow-sm">
                  {isConnecting ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>Connect<ArrowRight className="ml-2 h-5 w-5" /></>
                  )}
                </Button>
              </div>
              <FieldMessage>{fieldError || error}</FieldMessage>
            </form>
          )}

          <div className="text-center">
            <p className="font-albert text-muted-foreground mb-2 text-sm">
              Secure OAuth connection • Read/write products • Manage orders
            </p>
            <p className="font-albert text-muted-foreground text-xs">
              Store authorization opens in the next update. Tell us your store now and it will be ready to connect.
            </p>
          </div>

          <div className="border-border mx-auto max-w-md border-t pt-6">
            <p className="font-albert text-muted-foreground mb-3 text-sm">Don't use Shopify?</p>
            <Button variant="outline" onClick={onHostedSite} disabled={isConnecting} className="h-11 rounded-xl font-semibold">
              <Globe className="mr-2 h-4 w-4" />
              Join the list for a DSPLN-hosted academy store
            </Button>
            <div className="mt-4">
              <button type="button" onClick={onSkip} className="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-4 hover:underline">
                I'll connect my store later
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default memo(ShopifyConnectForm);
