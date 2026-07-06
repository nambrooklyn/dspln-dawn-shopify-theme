(() => {
  const BRIDGE_MARKER = 'data-dspln-cart-bridge';
  const MESSAGE_MARKER = 'data-dspln-last-cart-message';
  if (document.documentElement.getAttribute(BRIDGE_MARKER) === 'active') return;
  document.documentElement.setAttribute(BRIDGE_MARKER, 'active');

  const MESSAGE_TYPE = 'dspln:shopify-cart:add';
  const ALLOWED_HOSTS = ['127.0.0.1', 'localhost'];
  const frame = document.getElementById('dspln-configurator-frame');

  function readPriceVariantMap() {
    const node = document.getElementById('dspln-price-variants');
    if (!node) return {};
    try {
      return JSON.parse(node.textContent || '{}');
    } catch {
      return {};
    }
  }

  const PRICE_VARIANTS_BY_TOTAL = readPriceVariantMap();
  const CART_VARIANTS = {
    configuredDesign: null,
    kimono: null,
    belt: null,
    pant: null,
    logo10: null,
    backLogo25: null,
    beltText10: null,
  };

  const CHARGE_LABELS = {
    kimono: 'Kimono $55 charge',
    belt: 'Belt $15 charge',
    pant: 'Pant $45 charge',
    logo10: '$10 customization charge',
    backLogo25: 'Back logo $25 charge',
    beltText10: 'Belt text $10 charge',
  };

  function getCartSectionIds() {
    const sectionHost =
      document.querySelector('cart-drawer') ||
      document.querySelector('cart-notification');
    if (sectionHost && typeof sectionHost.getSectionsToRender === 'function') {
      return sectionHost.getSectionsToRender().map((section) => section.id);
    }
    return ['cart-drawer', 'cart-icon-bubble'];
  }

  function openCartDrawer() {
    const cartDrawer = document.querySelector('cart-drawer');
    if (cartDrawer) {
      cartDrawer.classList.remove('is-empty');
      if (typeof cartDrawer.open === 'function') {
        cartDrawer.open();
        return;
      }
    }

    [
      '[aria-controls="CartDrawer"]',
      '[data-action="open-drawer"][data-drawer-id="sidebar-cart"]',
      'a[href="/cart"][data-action="open-drawer"]',
      '#cart-icon-bubble',
      'cart-drawer-opener button',
      '.header__icon--cart',
      '.Header__Icon[data-action="open-drawer"]',
      '[data-cart-drawer-toggle]',
    ].some((selector) => {
      const opener = document.querySelector(selector);
      if (!opener || typeof opener.click !== 'function') return false;
      opener.click();
      return true;
    });
  }

  async function refreshCartPage(cart, addResult) {
    const cartDrawer = document.querySelector('cart-drawer');
    const cartNotification = document.querySelector('cart-notification');
    if (cartDrawer && typeof cartDrawer.renderContents === 'function' && addResult?.sections) {
      cartDrawer.renderContents(addResult);
    } else if (
      cartNotification &&
      typeof cartNotification.renderContents === 'function' &&
      addResult?.sections
    ) {
      cartNotification.renderContents(addResult);
    }

    window.dispatchEvent(new CustomEvent('cart:refresh', { detail: { cart } }));
    document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { detail: { cart } }));
    document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { cart } }));
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart } }));

    if (window.location.pathname.replace(/\/+$/, '') === '/cart') {
      window.location.reload();
    } else {
      window.location.href = '/cart';
    }
  }

  function legacyConfiguredLines(data) {
    if (!Array.isArray(data.items)) return [];
    return data.items.map((item) => ({
      quantity: item.quantity || 1,
      configuredTotal: 0,
      main: {
        quantity: item.quantity || 1,
        properties: item.properties || {},
      },
      charges: [],
    }));
  }

  function configuredLinesFromMessage(data) {
    return Array.isArray(data.configuredLines)
      ? data.configuredLines
      : legacyConfiguredLines(data);
  }

  function configuredTotalInDollars(configuredLine) {
    const total = Number(configuredLine.configuredTotal);
    return Number.isFinite(total) ? Math.round(total) : null;
  }

  function buildShopifyItems(configuredLine) {
    const mainProperties = configuredLine.main?.properties || {};
    const configuredTotal = configuredTotalInDollars(configuredLine);
    const priceVariantId =
      configuredTotal === null ? null : PRICE_VARIANTS_BY_TOTAL[configuredTotal];

    if (priceVariantId) {
      return [
        {
          id: priceVariantId,
          quantity: configuredLine.quantity || configuredLine.main?.quantity || 1,
          properties: mainProperties,
        },
      ];
    }

    const items = [];
    if (CART_VARIANTS.configuredDesign) {
      items.push({
        id: CART_VARIANTS.configuredDesign,
        quantity: configuredLine.quantity || configuredLine.main?.quantity || 1,
        properties: mainProperties,
      });
    }

    (configuredLine.charges || []).forEach((charge, index) => {
      const variantId = CART_VARIANTS[charge.variantKey];
      if (!variantId) {
        throw new Error(
          `Missing Shopify variant ID for ${CHARGE_LABELS[charge.variantKey] || charge.variantKey}.`,
        );
      }
      items.push({
        id: variantId,
        quantity: charge.quantity || 1,
        properties: charge.properties || {
          _dspln_line_role: 'custom_charge',
          _dspln_charge_label: charge.label || `Charge ${index + 1}`,
        },
      });
    });

    if (!items.length) {
      throw new Error(
        configuredTotal === null
          ? 'Configurator did not provide a configured total.'
          : `No Shopify price variant found for $${configuredTotal}. Add a TDA_PRICE_${configuredTotal} variant to this product.`,
      );
    }
    return items;
  }

  function isAllowedOrigin(origin) {
    try {
      return ALLOWED_HOSTS.includes(new URL(origin).hostname);
    } catch {
      return false;
    }
  }

  async function addItemsToCart(items) {
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        items,
        sections: getCartSectionIds(),
        sections_url: window.location.pathname,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.description ||
          payload?.message ||
          'Shopify rejected the cart request.',
      );
    }
    return payload;
  }

  async function getCart() {
    const response = await fetch('/cart.js', {
      headers: { Accept: 'application/json' },
    });
    return response.json();
  }

  function rememberMessage(data) {
    try {
      document.documentElement.setAttribute(
        MESSAGE_MARKER,
        JSON.stringify({
          at: new Date().toISOString(),
          configuredLines: configuredLinesFromMessage(data).length,
        }),
      );
    } catch {
      // Debug marker only.
    }
  }

  window.addEventListener('message', async (event) => {
    if (!isAllowedOrigin(event.origin)) return;
    const data = event.data || {};
    if (data.type !== MESSAGE_TYPE) return;

    try {
      rememberMessage(data);
      const items = configuredLinesFromMessage(data).flatMap(buildShopifyItems);
      const addResult = await addItemsToCart(items);
      const cart = await getCart();
      frame?.contentWindow?.postMessage(
        { type: 'dspln:shopify-cart:added', cart },
        event.origin,
      );
      openCartDrawer();
      await refreshCartPage(cart, addResult);
    } catch (error) {
      frame?.contentWindow?.postMessage(
        {
          type: 'dspln:shopify-cart:error',
          message: error instanceof Error ? error.message : String(error),
        },
        event.origin,
      );
      console.error('[DSPLN configurator cart bridge]', error);
    }
  });
})();
