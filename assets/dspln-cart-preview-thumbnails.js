(() => {
  const MARKER = 'data-dspln-cart-preview-thumbnails';
  const PREVIEW_PROPERTY = '_preview_image_url';
  const DESIGN_ID_PROPERTIES = ['_dspln_design_id', '_configurator_id'];
  const DESIGN_LOOKUP_ORIGIN = 'https://dspln-dawn-shopify-theme.netlify.app';
  const LOCAL_PREVIEW_STORAGE_PREFIX = 'dspln:cart-preview:';
  const LOCAL_PREVIEW_FINGERPRINT_PREFIX = 'dspln:cart-preview:fingerprint:';
  const LOCAL_CONFIG_STORAGE_PREFIX = 'dspln:cart-config:';

  if (document.documentElement.getAttribute(MARKER) === 'active') return;
  document.documentElement.setAttribute(MARKER, 'active');

  const designDataCache = new Map();

  async function fetchCart() {
    const response = await fetch('/cart.js', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;
    return response.json();
  }

  function rows() {
    return Array.from(document.querySelectorAll('.cart-item, tr.cart-item, [id^="CartItem-"]'));
  }

  function images() {
    return rows()
      .map((row) => row.querySelector('.cart-item__image'))
      .filter(Boolean);
  }

  function designIdFromProperties(properties = {}) {
    for (const property of DESIGN_ID_PROPERTIES) {
      if (typeof properties[property] === 'string' && properties[property]) {
        return properties[property];
      }
    }

    const values = Object.values(properties).filter((value) => typeof value === 'string');
    for (const value of values) {
      const match = value.match(/[?&]design=([^&#]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }

    return '';
  }

  function designIdForRow(row, properties = {}) {
    return row?.getAttribute?.('data-dspln-design-id') || designIdFromProperties(properties);
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

  async function designDataFromDesignId(designId) {
    if (!designId) return '';
    if (designDataCache.has(designId)) return designDataCache.get(designId);

    const lookupUrl = new URL('/.netlify/functions/customer-designs', DESIGN_LOOKUP_ORIGIN);
    lookupUrl.searchParams.set('id', designId);

    try {
      const response = await fetch(lookupUrl.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        designDataCache.set(designId, null);
        return '';
      }

      const payload = await response.json();
      const design = payload?.data?.design || null;
      designDataCache.set(designId, design);
      return design;
    } catch {
      designDataCache.set(designId, null);
      return '';
    }
  }

  function localConfigFromDesignId(designId) {
    if (!designId) return null;
    try {
      const raw = window.localStorage.getItem(`${LOCAL_CONFIG_STORAGE_PREFIX}${designId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function allLocalCartConfigs() {
    const configs = [];
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key?.startsWith(LOCAL_CONFIG_STORAGE_PREFIX)) continue;

        const raw = window.localStorage.getItem(key);
        if (!raw) continue;

        const config = JSON.parse(raw);
        const designId = key.slice(LOCAL_CONFIG_STORAGE_PREFIX.length);
        configs.push({ designId, config });
      }
    } catch {
      return configs;
    }
    return configs;
  }

  function localConfigForArtworkRow(row, layerNumber) {
    const designId = row?.getAttribute?.('data-dspln-design-id') || '';
    const directConfig = localConfigFromDesignId(designId);
    if (artworkLayerUrlFromLocalConfig(directConfig, layerNumber)) return directConfig;

    return (
      allLocalCartConfigs().find(({ config }) =>
        Boolean(artworkLayerUrlFromLocalConfig(config, layerNumber)),
      )?.config || directConfig
    );
  }

  async function previewUrlFromDesignId(designId) {
    try {
      const localPreviewUrl = window.localStorage.getItem(`${LOCAL_PREVIEW_STORAGE_PREFIX}${designId}`);
      if (typeof localPreviewUrl === 'string' && /^(https?:\/\/|data:image\/)/.test(localPreviewUrl)) {
        return localPreviewUrl;
      }
    } catch {
      // Local preview cache is optional.
    }

    const design = await designDataFromDesignId(designId);
    const thumbnailUrl = design?.thumbnailUrl;
    return typeof thumbnailUrl === 'string' ? thumbnailUrl : '';
  }

  function previewUrlFromFingerprint(properties = {}) {
    const fingerprint = lineFingerprintFromProperties(properties);
    if (!fingerprint) return '';

    try {
      const url = window.localStorage.getItem(`${LOCAL_PREVIEW_FINGERPRINT_PREFIX}${fingerprint}`);
      return typeof url === 'string' && /^(https?:\/\/|data:image\/)/.test(url) ? url : '';
    } catch {
      return '';
    }
  }

  async function previewUrlForItem(item) {
    const properties = item?.properties || {};
    const directPreview = properties[PREVIEW_PROPERTY] || properties._mczr_image;

    if (typeof directPreview === 'string' && /^(https?:\/\/|data:image\/)/.test(directPreview)) {
      return directPreview;
    }

    return (
      (await previewUrlFromDesignId(designIdFromProperties(properties))) ||
      previewUrlFromFingerprint(properties)
    );
  }

  function clearPendingImage(image) {
    if (!image) return;
    image.classList.remove('cart-item__image--dspln-pending');
    image.removeAttribute('data-dspln-preview-pending');
  }

  function clearAllPendingImages() {
    images().forEach(clearPendingImage);
  }

  function setPreviewImage(image, url) {
    if (!image || !url) return;

    image.src = url;
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.classList.add('cart-item__image--dspln-preview');
    clearPendingImage(image);
    image.setAttribute('data-dspln-preview-image', 'true');
    image.alt = image.alt || 'Customization preview';

    const frame = image.closest('.cart-item__image-container, .cart-item__media');
    if (frame) {
      frame.setAttribute('data-dspln-preview-frame', 'true');
    }
  }

  function isDsplnCustomRow(row, item) {
    if (row?.classList?.contains('cart-item--dspln-custom')) return true;

    const productTitle = normalizedText(item?.product_title || item?.title || '');
    const productHandle = normalizedText(item?.handle || item?.product_handle || item?.url || '');
    if (
      productTitle.includes('rashguard') ||
      productTitle.includes('grappling short') ||
      productTitle.includes('custom gi') ||
      productTitle.includes('kids') ||
      productTitle.includes('women') ||
      productHandle.includes('custom') ||
      productHandle.includes('configurator')
    ) {
      return true;
    }

    const properties = item?.properties || {};
    return Object.keys(properties).some((key) => {
      const normalizedKey = normalizedText(key);
      return (
        normalizedKey.includes('dspln') ||
        normalizedKey.includes('kimono') ||
        normalizedKey.includes('belt') ||
        normalizedKey.includes('pant') ||
        normalizedKey.includes('logo') ||
        normalizedKey.includes('artwork') ||
        normalizedKey.includes('rashguard') ||
        normalizedKey.includes('front body color') ||
        normalizedKey.includes('back body color') ||
        normalizedKey.includes('sleeve color') ||
        normalizedKey.includes('neck band color') ||
        normalizedKey.includes('grappling short') ||
        normalizedKey.includes('waistband color') ||
        normalizedKey.includes('leg color')
      );
    });
  }

  function normalizedText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function logoLabelForArtwork(artwork) {
    const slotLabels = {
      'left-chest': 'left chest',
      'left-sleeve': 'left sleeve',
      'right-sleeve': 'right sleeve',
      back: 'back',
      'left-pant': 'left thigh',
      'right-pant': 'right thigh',
    };
    const part = normalizedText(artwork?.part || '').includes('pant') ? 'pant' : 'kimono';
    const slot = slotLabels[artwork?.slot] || normalizedText(artwork?.slot || '');
    return normalizedText(`${part} ${slot} logo`);
  }

  function urlFromArtwork(artwork) {
    const candidates = [
      artwork?.url,
      artwork?.imageUrl,
      artwork?.dataUrl,
      artwork?.fileUrl,
      artwork?.src,
      artwork?.href,
    ];
    return candidates.find((candidate) => typeof candidate === 'string' && /^(https?:\/\/|data:image\/|blob:)/.test(candidate)) || '';
  }

  function logoUrlFromProperties(properties, label) {
    const normalizedLabel = normalizedText(label);
    const artworkLabel = normalizedLabel.replace(/^kimono /, '').replace(/^pant /, '').replace(/ logo$/, ' artwork');
    const directKey = Object.keys(properties || {}).find((key) => {
      const normalizedKey = normalizedText(key);
      return normalizedKey === artworkLabel || normalizedKey.includes(artworkLabel);
    });
    const directValue = directKey ? properties[directKey] : '';
    return typeof directValue === 'string' && /^(https?:\/\/|data:image\/|blob:)/.test(directValue) ? directValue : '';
  }

  function logoUrlFromLocalConfig(localConfig, label) {
    const normalizedLabel = normalizedText(label);
    const groups = [
      ['kimono', localConfig?.images?.kimono],
      ['pant', localConfig?.images?.pant],
    ];
    const slotLabels = {
      'left-chest': 'left chest',
      'left-sleeve': 'left sleeve',
      'right-sleeve': 'right sleeve',
      back: 'back',
      'left-pant': 'left thigh',
      'right-pant': 'right thigh',
    };

    for (const [part, group] of groups) {
      if (!group || typeof group !== 'object') continue;
      for (const [slot, image] of Object.entries(group)) {
        const slotLabel = slotLabels[slot] || normalizedText(slot);
        const candidateLabel = normalizedText(`${part} ${slotLabel} logo`);
        if (candidateLabel !== normalizedLabel) continue;

        const url = urlFromArtwork(image);
        if (url) return url;
      }
    }

    return '';
  }

  function logoUrlFromDesign(design, label) {
    const normalizedLabel = normalizedText(label);
    const artwork = Array.isArray(design?.artwork) ? design.artwork : [];
    const match = artwork.find((entry) => logoLabelForArtwork(entry) === normalizedLabel);
    const directUrl = urlFromArtwork(match);
    if (directUrl) return directUrl;

    const configImages = design?.configData?.images || {};
    const imageGroups = [configImages.kimono, configImages.jacket, configImages.pant, configImages.pants];
    for (const group of imageGroups) {
      if (!group || typeof group !== 'object') continue;
      for (const value of Object.values(group)) {
        const url = urlFromArtwork(value);
        if (url) return url;
      }
    }

    return '';
  }

  function setLogoLink(placeholder, url) {
    if (!placeholder || !url || placeholder.querySelector('a')) return;
    const link = document.createElement('a');
    link.className = 'link dspln-line-item-properties__logo-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = placeholder.textContent || 'YES';
    placeholder.replaceChildren(link);
  }

  function setArtworkValueLink(valueEl, url) {
    if (!valueEl || !url || valueEl.querySelector('a')) return;
    const link = document.createElement('a');
    link.className = 'link dspln-line-item-properties__logo-link';
    if (/^(data:image\/|blob:)/.test(url)) {
      link.href = '#dspln-artwork-preview';
      link.dataset.dsplnLocalImageUrl = url;
    } else {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
    }
    link.textContent = valueEl.textContent?.trim() || 'Artwork';
    valueEl.replaceChildren(link);
  }

  function imageViewerHtml(title) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #f7f7f2;
        font-family: Arial, sans-serif;
      }
      body {
        display: grid;
        place-items: center;
        padding: 32px;
        box-sizing: border-box;
      }
      img {
        max-width: min(100%, 1200px);
        max-height: calc(100vh - 64px);
        object-fit: contain;
        background: transparent;
      }
    </style>
  </head>
  <body>
    <img alt="${title}">
  </body>
</html>`;
  }

  function openImageViewer(url, title) {
    const viewer = window.open('', '_blank');
    if (!viewer) return false;
    viewer.opener = null;
    viewer.document.open();
    viewer.document.write(imageViewerHtml(title || 'DSPLN artwork'));
    viewer.document.close();
    const image = viewer.document.querySelector('img');
    if (image) image.src = url;
    return true;
  }

  function handleLocalImageLinkClick(event) {
    const link = event.target?.closest?.('a.dspln-line-item-properties__logo-link');
    if (!link) return;

    const href = link.getAttribute('href') || '';
    const localImageUrl = link.dataset.dsplnLocalImageUrl || '';
    const viewerUrl = /^(data:image\/|blob:)/.test(localImageUrl)
      ? localImageUrl
      : href;
    if (!/^(data:image\/|blob:)/.test(viewerUrl)) return;

    event.preventDefault();
    openImageViewer(viewerUrl, link.textContent?.trim() || 'DSPLN artwork');
  }

  async function applyLogoLinksForItem(item, row) {
    const placeholders = Array.from(row?.querySelectorAll('[data-dspln-logo-placeholder]') || []);
    if (!placeholders.length) return;

    const properties = item?.properties || {};
    const designId = designIdForRow(row, properties);
    const design = await designDataFromDesignId(designId);
    const localConfig = localConfigFromDesignId(designId);

    placeholders.forEach((placeholder) => {
      const label = placeholder.getAttribute('data-dspln-logo-label') || '';
      const url =
        logoUrlFromProperties(properties, label) ||
        logoUrlFromLocalConfig(localConfig, label) ||
        logoUrlFromDesign(design, label);
      setLogoLink(placeholder, url);
    });
  }

  function artworkLayerUrlFromProperties(properties, layerNumber) {
    const directKey = `_dspln_artwork_layer_${layerNumber}_url`;
    const directValue = properties?.[directKey];
    if (typeof directValue === 'string' && /^(https?:\/\/|data:image\/|blob:)/.test(directValue)) {
      return directValue;
    }

    const matchingKey = Object.keys(properties || {}).find((key) => {
      const normalizedKey = normalizedText(key);
      return (
        normalizedKey === normalizedText(directKey) ||
        normalizedKey === `dspln artwork layer ${layerNumber} url`
      );
    });
    const matchingValue = matchingKey ? properties[matchingKey] : '';
    return typeof matchingValue === 'string' && /^(https?:\/\/|data:image\/|blob:)/.test(matchingValue)
      ? matchingValue
      : '';
  }

  function artworkLayerUrlFromLocalConfig(localConfig, layerNumber) {
    const directValue = localConfig?.artworkLayerUrls?.[String(Number(layerNumber) - 1)];
    if (typeof directValue === 'string' && /^(https?:\/\/|data:image\/|blob:)/.test(directValue)) {
      return directValue;
    }

    const numericValue = localConfig?.artworkLayerUrls?.[Number(layerNumber) - 1];
    return typeof numericValue === 'string' && /^(https?:\/\/|data:image\/|blob:)/.test(numericValue)
      ? numericValue
      : '';
  }

  function applyArtworkLinksForItem(item, row) {
    const properties = item?.properties || {};
    const localConfig = localConfigFromDesignId(designIdForRow(row, properties));
    const rows = Array.from(row?.querySelectorAll('.dspln-line-item-properties__row') || []);

    rows.forEach((propertyRow) => {
      const label = propertyRow.querySelector('dt')?.textContent || '';
      const match = label.match(/Artwork\s+(\d+)/i);
      if (!match?.[1]) return;

      const url =
        artworkLayerUrlFromProperties(properties, match[1]) ||
        artworkLayerUrlFromLocalConfig(localConfig, match[1]);
      if (!url) return;
      setArtworkValueLink(propertyRow.querySelector('dd'), url);
    });
  }

  function applyArtworkLinksFromRenderedRows() {
    rows().forEach((row) => {
      Array.from(row.querySelectorAll('.dspln-line-item-properties__row')).forEach((propertyRow) => {
        const label = propertyRow.querySelector('dt')?.textContent || '';
        const match = label.match(/Artwork\s+(\d+)/i);
        if (!match?.[1]) return;

        const localConfig = localConfigForArtworkRow(row, match[1]);
        const url = artworkLayerUrlFromLocalConfig(localConfig, match[1]);
        if (!url) return;
        setArtworkValueLink(propertyRow.querySelector('dd'), url);
      });
    });
  }

  async function applyPreviewImages() {
    const cart = await fetchCart();
    if (!cart?.items?.length) {
      clearAllPendingImages();
      return;
    }

    const cartRows = rows();
    const cartImages = images();

    await Promise.all(
      cart.items.map(async (item, index) => {
        const url = await previewUrlForItem(item);

        const row = cartRows[index];
        const image = row?.querySelector('.cart-item__image') || cartImages[index];
        if (url) {
          setPreviewImage(image, url);
        } else if (isDsplnCustomRow(row, item)) {
          image?.classList.add('cart-item__image--dspln-pending');
          image?.setAttribute('data-dspln-preview-pending', 'true');
        } else {
          clearPendingImage(image);
        }
        await applyLogoLinksForItem(item, row);
        applyArtworkLinksForItem(item, row);
      }),
    );

    applyArtworkLinksFromRenderedRows();
  }

  let refreshTimer = 0;
  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      applyArtworkLinksFromRenderedRows();
      applyPreviewImages().catch(() => {});
    }, 50);
  }

  ['DOMContentLoaded', 'cart:refresh', 'cart:updated', 'cart:change', 'shopify:section:load'].forEach((eventName) => {
    window.addEventListener(eventName, scheduleRefresh);
    document.addEventListener(eventName, scheduleRefresh);
  });

  document.addEventListener('click', handleLocalImageLinkClick);

  new MutationObserver(scheduleRefresh).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scheduleRefresh();
})();
