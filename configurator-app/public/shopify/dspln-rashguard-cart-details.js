(() => {
  const MARKER = 'data-dspln-rashguard-cart-details';
  if (document.documentElement.getAttribute(MARKER) === 'active') return;
  document.documentElement.setAttribute(MARKER, 'active');

  const SCRIPT_VERSION = '20260612-rashguard-cart-details-6';
  const DETAIL_FORMAT = 'rashguard-v6';
  const VISIBLE_PROPERTY_ORDER = [
    'Rashguard Size',
    'Front Body Color',
    'Back Body Color',
    'Left Sleeve Color',
    'Right Sleeve Color',
    'Neck Band Color',
    'Stitching Color',
  ];

  function installStyles() {
    if (document.getElementById('dspln-rashguard-cart-details-styles')) return;
    const style = document.createElement('style');
    style.id = 'dspln-rashguard-cart-details-styles';
    style.textContent = `
      html[${MARKER}="active"] [id^="shopify-section-"][id*="custom_liquid"] .SectionHeader {
        display: none !important;
      }

      html[${MARKER}="active"] [id^="shopify-section-"][id*="custom_liquid"] .Section,
      html[${MARKER}="active"] [id^="shopify-section-"][id*="custom_liquid"] .Section--spacingNormal {
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
      }

      body.template-cart .CartItem--dspln-rashguard .CartItem__DsplnDetails,
      #sidebar-cart .CartItem--dspln-rashguard .CartItem__DsplnDetails {
        display: block !important;
        margin: 6px 0 0 !important;
        max-width: none !important;
        padding-left: 0 !important;
        text-align: left !important;
        overflow: visible !important;
      }

      body.template-cart .CartItem--dspln-rashguard .CartItem__DsplnGroup,
      #sidebar-cart .CartItem--dspln-rashguard .CartItem__DsplnGroup {
        margin: 8px 0 0 !important;
        padding: 8px 0 0 !important;
        border-top: 1px solid #e2e2e2 !important;
      }

      body.template-cart .CartItem--dspln-rashguard .CartItem__DsplnGroup:first-child,
      #sidebar-cart .CartItem--dspln-rashguard .CartItem__DsplnGroup:first-child {
        margin-top: 0 !important;
        padding-top: 0 !important;
        border-top: 0 !important;
      }

      body.template-cart .CartItem--dspln-rashguard .CartItem__DsplnRow,
      #sidebar-cart .CartItem--dspln-rashguard .CartItem__DsplnRow {
        color: #9a9a9a !important;
        font-size: 10px !important;
        line-height: 1.65 !important;
        letter-spacing: 0.06em !important;
        text-transform: uppercase !important;
      }

      body.template-cart .CartItem--dspln-rashguard .CartItem__DsplnRow strong,
      #sidebar-cart .CartItem--dspln-rashguard .CartItem__DsplnRow strong {
        color: #252525 !important;
        font-weight: 500 !important;
        letter-spacing: 0.03em !important;
      }

      body.template-cart .CartItem--dspln-rashguard .CartItem__DsplnYes,
      body.template-cart .CartItem--dspln-rashguard .CartItem__DsplnLayerLink,
      #sidebar-cart .CartItem--dspln-rashguard .CartItem__DsplnYes,
      #sidebar-cart .CartItem--dspln-rashguard .CartItem__DsplnLayerLink {
        color: #7a1717 !important;
        font-style: italic !important;
        text-decoration: underline !important;
        text-underline-offset: 2px !important;
      }

      @media screen and (min-width: 769px) {
        body.template-cart .CartItem--dspln-custom-preview {
          align-items: start !important;
        }

        html body.template-cart .Cart .Cart__ItemList .CartItem.CartItem--dspln-custom-preview > .CartItem__ImageWrapper,
        body.template-cart .CartItem--dspln-custom-preview > .CartItem__ImageWrapper,
        #sidebar-cart .CartItem--dspln-custom-preview > .CartItem__ImageWrapper {
          align-self: start !important;
          margin-top: 0 !important;
          place-self: start start !important;
        }

        body.template-cart .CartItem--dspln-custom-preview .CartItem__Image,
        #sidebar-cart .CartItem--dspln-custom-preview .CartItem__Image {
          object-position: center top !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function propKey(value) {
    return clean(value).toLowerCase();
  }

  function isRashguardLine(line) {
    const title = clean(
      line && (line.product_title || line.title || line.productTitle),
    ).toLowerCase();
    return title.includes('rashguard');
  }

  function cartLines() {
    const cart = window.MyCustomizerCart && window.MyCustomizerCart.cart;
    return cart && Array.isArray(cart.items) ? cart.items : [];
  }

  function cartRows() {
    return Array.from(
      document.querySelectorAll(
        '.CartItem, .cart-item, [data-cart-item], [id^="CartItem-"]',
      ),
    );
  }

  function rowMatchesLine(row, line, index) {
    if (!row || !line) return false;
    const text = clean(row.textContent).toLowerCase();
    const title = clean(line.product_title || line.title || '').toLowerCase();
    if (title && text.includes(title.slice(0, 22))) return true;
    if (row.id === `CartItem-${index + 1}`) return true;
    return false;
  }

  function propertiesForLine(line) {
    const raw = (line && line.properties) || {};
    if (Array.isArray(raw)) {
      return raw.reduce((props, prop) => {
        if (prop && prop.name) props[prop.name] = prop.value;
        return props;
      }, {});
    }
    return raw;
  }

  function propertyValue(properties, name) {
    const wanted = propKey(name);
    const match = Object.keys(properties).find((key) => propKey(key) === wanted);
    return match ? properties[match] : '';
  }

  function artworkLayerUrl(properties, index) {
    return clean(propertyValue(properties, `_dspln_artwork_layer_${index}_url`));
  }

  function artworkLayerRows(properties) {
    const explicitRows = Object.keys(properties)
      .map((name) => {
        const match = propKey(name).match(/^artwork layer (\d+)$/);
        if (!match) return null;
        return {
          index: Number(match[1]),
          label: name,
          value: properties[name],
          url: artworkLayerUrl(properties, Number(match[1])),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index)
      .map(({ label, value, url }) => ({ label, value, url }));

    if (explicitRows.length) return explicitRows;

    const legacy = clean(propertyValue(properties, 'Artwork Layers'));
    if (!legacy || /^no$/i.test(legacy)) {
      return legacy ? [{ label: 'Artwork Layers', value: legacy }] : [];
    }

    return legacy
      .split(/\s*\|\s*/g)
      .map((value, index) => {
        const layerValue = clean(value).replace(/^\d+\.\s*/, '');
        return layerValue ? { label: `Artwork Layer ${index + 1}`, value: layerValue } : null;
      })
      .filter(Boolean);
  }

  function detailRows(properties) {
    const baseRows = VISIBLE_PROPERTY_ORDER.map((name) => ({
      label: name,
      value: propertyValue(properties, name),
    })).filter((row) => clean(row.value));
    return [...baseRows, ...artworkLayerRows(properties)];
  }

  function makeDetailRow(row, properties) {
    const line = document.createElement('div');
    line.className = 'CartItem__DsplnRow';

    const label = document.createElement('span');
    label.textContent = `${row.label}: `;
    line.appendChild(label);

    appendLayerValue(line, row);
    return line;
  }

  function appendLayerValue(line, row) {
    const valueText = clean(row.value);
    const url = clean(row.url);
    if (/^https?:\/\//i.test(url) && /^artwork layer \d+$/i.test(clean(row.label))) {
      const match = valueText.match(/^(.*?)\s+on\s+(.+)$/i);
      const filename = clean(match ? match[1] : valueText);
      const target = clean(match ? match[2] : '');
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'CartItem__DsplnYes CartItem__DsplnLayerLink';
      link.textContent = filename;
      line.appendChild(link);
      if (target) {
        line.appendChild(document.createTextNode(` on ${target}`));
      }
      return;
    }

    const value = document.createElement('strong');
    value.textContent = valueText;
    line.appendChild(value);
  }

  function buildDetails(properties) {
    const rows = detailRows(properties);
    if (!rows.length) return null;

    const details = document.createElement('div');
    details.className = 'CartItem__DsplnDetails';
    details.setAttribute('data-dspln-details-format', DETAIL_FORMAT);
    details.setAttribute('data-dspln-details-version', SCRIPT_VERSION);

    const group = document.createElement('div');
    group.className = 'CartItem__DsplnGroup CartItem__DsplnGroup--rashguard';

    rows.forEach((row) => group.appendChild(makeDetailRow(row, properties)));
    details.appendChild(group);

    return details;
  }

  function replaceLegacyKimonoTitle(row) {
    row
      .querySelectorAll('.CartItem__DsplnDetailsTitle, .CartItem__DsplnGroupTitle')
      .forEach((title) => {
        const text = clean(title.textContent);
        if (/^(kimono|rashguard)$/i.test(text)) {
          title.remove();
        }
      });
  }

  function linkExistingYesValues(row, properties) {
    row.querySelectorAll('.CartItem__DsplnDetailsRow').forEach((detailRow) => {
      const label = clean(
        detailRow.querySelector('.CartItem__DsplnDetailsLabel')?.textContent || '',
      ).replace(/:$/, '');
      const urlProperty = ARTWORK_URL_PROPERTY[propKey(label)];
      if (!urlProperty) return;

      const url = clean(propertyValue(properties, urlProperty));
      if (!/^https?:\/\//i.test(url)) return;

      const valueNode =
        detailRow.querySelector('.CartItem__DsplnYes') ||
        Array.from(detailRow.querySelectorAll('span')).find((span) =>
          /^yes$/i.test(clean(span.textContent)),
        );
      if (!valueNode || valueNode.tagName.toLowerCase() === 'a') return;

      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = valueNode.className || 'CartItem__DsplnYes';
      link.textContent = clean(valueNode.textContent) || 'YES';
      valueNode.replaceWith(link);
    });
  }

  function renderRashguardRow(row, line) {
    const properties = propertiesForLine(line);
    row.classList.add('CartItem--dspln-rashguard');
    replaceLegacyKimonoTitle(row);

    const current = row.querySelector(
      `.CartItem__DsplnDetails[data-dspln-details-format="${DETAIL_FORMAT}"]`,
    );
    const signature = JSON.stringify(detailRows(properties));
    if (current && current.getAttribute('data-dspln-signature') === signature) {
      return;
    }

    const existingDetails = row.querySelectorAll('.CartItem__DsplnDetails');
    existingDetails.forEach((details) => details.remove());
    row.querySelectorAll('.CartItem__PropertyList, .cart-item__options').forEach((list) => {
      list.remove();
    });

    const details = buildDetails(properties);
    if (!details) return;
    details.setAttribute('data-dspln-signature', signature);

    const meta =
      row.querySelector('.CartItem__Meta') ||
      row.querySelector('.CartItem__Info') ||
      row.querySelector('.cart-item__details') ||
      row;
    meta.appendChild(details);
  }

  function applyRashguardCartDetails() {
    installStyles();
    const lines = cartLines();
    if (!lines.length) return;

    const rows = cartRows();
    const usedRows = new Set();
    lines.forEach((line, index) => {
      if (!isRashguardLine(line)) return;
      const row =
        rows.find((candidate) => {
          if (usedRows.has(candidate)) return false;
          return rowMatchesLine(candidate, line, index);
        }) || rows[index];
      if (!row) return;
      usedRows.add(row);
      renderRashguardRow(row, line);
    });
  }

  let scheduleTimer = 0;
  function schedule() {
    window.clearTimeout(scheduleTimer);
    scheduleTimer = window.setTimeout(applyRashguardCartDetails, 30);
    window.setTimeout(applyRashguardCartDetails, 250);
    window.setTimeout(applyRashguardCartDetails, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }

  ['cart:refresh', 'cart:updated', 'shopify:section:load'].forEach((eventName) => {
    document.addEventListener(eventName, schedule);
  });
})();
