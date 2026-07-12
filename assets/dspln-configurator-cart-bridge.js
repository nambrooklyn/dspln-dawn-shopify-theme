(() => {
  const BRIDGE_MARKER = 'data-dspln-cart-bridge';
  const MESSAGE_MARKER = 'data-dspln-last-cart-message';
  if (document.documentElement.getAttribute(BRIDGE_MARKER) === 'active') return;
  document.documentElement.setAttribute(BRIDGE_MARKER, 'active');

  const ADD_MESSAGE_TYPE = 'dspln:shopify-cart:add';
  const UPDATE_MESSAGE_TYPE = 'dspln:shopify-cart:update';
  const ALLOWED_HOSTS = [
    '127.0.0.1',
    'localhost',
    'dspln-dawn-shopify-theme.netlify.app',
  ];
  const LOCAL_PREVIEW_STORAGE_PREFIX = 'dspln:cart-preview:';
  const LOCAL_PREVIEW_FINGERPRINT_PREFIX = 'dspln:cart-preview:fingerprint:';
  const LOCAL_CONFIG_STORAGE_PREFIX = 'dspln:cart-config:';
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
  function readFrameVariantId() {
    if (!frame?.src) return null;
    try {
      const variantId = new URL(frame.src).searchParams.get('variantId');
      return variantId && /^\d+$/.test(variantId) ? variantId : null;
    } catch {
      return null;
    }
  }

  const DEFAULT_PRODUCT_VARIANT_ID = readFrameVariantId();
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
    let renderedInlineCart = false;
    if (cartDrawer && typeof cartDrawer.renderContents === 'function' && addResult?.sections) {
      cartDrawer.renderContents(addResult);
      renderedInlineCart = true;
    } else if (
      cartNotification &&
      typeof cartNotification.renderContents === 'function' &&
      addResult?.sections
    ) {
      cartNotification.renderContents(addResult);
      renderedInlineCart = true;
    }

    window.dispatchEvent(new CustomEvent('cart:refresh', { detail: { cart } }));
    document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { detail: { cart } }));
    document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { cart } }));
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart } }));

    if (renderedInlineCart) return;

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

  function designIdFromProperties(properties = {}) {
    return properties._dspln_design_id || properties._configurator_id || '';
  }

  function lineFingerprintFromProperties(properties = {}) {
    try {
      const entries = Object.entries(properties)
        .filter(([key, value]) => {
          if (!key || key.charAt(0) === '_') return false;
          if (value === null || value === undefined || value === '') return false;
          return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
        })
        .map(([key, value]) => [String(key).trim().toLowerCase(), String(value).trim().toLowerCase()])
        .sort(([a], [b]) => a.localeCompare(b));

      return entries.length ? JSON.stringify(entries) : '';
    } catch {
      return '';
    }
  }

  function rememberLocalPreview(configuredLine) {
    const properties = configuredLine.main?.properties || {};
    const designId = designIdFromProperties(properties) || configuredLine.id || '';
    const previewUrl = configuredLine.previewImageUrl || properties._preview_image_url || '';
    if (typeof previewUrl !== 'string' || !previewUrl) return;

    try {
      if (designId) {
        window.localStorage.setItem(`${LOCAL_PREVIEW_STORAGE_PREFIX}${designId}`, previewUrl);
      }
      const fingerprint = lineFingerprintFromProperties(properties);
      if (fingerprint) {
        window.localStorage.setItem(`${LOCAL_PREVIEW_FINGERPRINT_PREFIX}${fingerprint}`, previewUrl);
      }
    } catch {
      // Local previews are an enhancement for theme dev/cart display only.
    }
  }

  function rememberLocalConfig(configuredLine) {
    const properties = configuredLine.main?.properties || {};
    const designId = designIdFromProperties(properties) || configuredLine.id || '';
    if (!designId || !configuredLine.configData) return;

    try {
      window.localStorage.setItem(
        `${LOCAL_CONFIG_STORAGE_PREFIX}${designId}`,
        JSON.stringify(configuredLine.configData),
      );
    } catch {
      // Local config restore is an enhancement for theme dev/cart edit only.
    }
  }

  function cartEditLineKeyFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') !== 'cart-edit') return '';
    return normalizeCartLineKey(params.get('cart_line') || '');
  }

  function normalizeCartLineKey(value) {
    let key = String(value || '').trim();
    for (let index = 0; index < 2; index += 1) {
      if (!/%[0-9A-F]{2}/i.test(key)) break;
      try {
        const decoded = decodeURIComponent(key);
        if (decoded === key) break;
        key = decoded;
      } catch {
        break;
      }
    }
    return key;
  }

  function buildShopifyItems(configuredLine) {
    rememberLocalPreview(configuredLine);
    rememberLocalConfig(configuredLine);
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
    const mainVariantId = CART_VARIANTS.configuredDesign || DEFAULT_PRODUCT_VARIANT_ID;
    if (mainVariantId) {
      items.push({
        id: mainVariantId,
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

  async function changeCartLine(body) {
    const response = await fetch('/cart/change.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        ...body,
        quantity: 0,
        sections: getCartSectionIds(),
        sections_url: window.location.pathname,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        payload?.description ||
          payload?.message ||
          'Shopify could not remove the previous cart line.',
      );
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function lineNumberForKey(cart, cartLineKey) {
    const key = normalizeCartLineKey(cartLineKey);
    if (!key || !Array.isArray(cart?.items)) return null;
    const index = cart.items.findIndex((item) => item?.key === key);
    return index >= 0 ? index + 1 : null;
  }

  async function removeCartLine(cartLineKey) {
    const normalizedCartLineKey = normalizeCartLineKey(cartLineKey);
    if (!normalizedCartLineKey) {
      throw new Error('Configurator did not provide the cart line to update.');
    }

    try {
      return await changeCartLine({ id: normalizedCartLineKey });
    } catch (idError) {
      const cart = await getCart();
      const line = lineNumberForKey(cart, normalizedCartLineKey);
      if (!line) {
        throw idError;
      }
      return changeCartLine({ line });
    }
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
          type: data.type,
          cartLineKey: data.cartLineKey || '',
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
    if (data.type !== ADD_MESSAGE_TYPE && data.type !== UPDATE_MESSAGE_TYPE) return;
    const cartLineKey = normalizeCartLineKey(data.cartLineKey || cartEditLineKeyFromUrl());
    const isCartUpdate = data.type === UPDATE_MESSAGE_TYPE || Boolean(cartLineKey);

    try {
      rememberMessage(data);
      const items = configuredLinesFromMessage(data).flatMap(buildShopifyItems);
      const addResult = await addItemsToCart(items);
      let renderResult = addResult;
      if (isCartUpdate) {
        renderResult = await removeCartLine(cartLineKey);
      }
      const cart = await getCart();
      frame?.contentWindow?.postMessage(
        {
          type:
            isCartUpdate
              ? 'dspln:shopify-cart:updated'
              : 'dspln:shopify-cart:added',
          cart,
        },
        event.origin,
      );

      try {
        openCartDrawer();
        await refreshCartPage(cart, renderResult);
      } catch (refreshError) {
        window.location.href = '/cart';
        console.warn('[DSPLN configurator cart bridge] Cart UI refresh failed after add', refreshError);
      }
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
