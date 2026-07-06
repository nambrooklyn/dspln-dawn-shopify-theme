(() => {
  const MARKER = 'data-dspln-hide-zero-prices';
  if (document.documentElement.getAttribute(MARKER) === 'active') return;
  document.documentElement.setAttribute(MARKER, 'active');

  const ZERO_PRICE_PATTERN =
    /^(from\s+)?(\$|usd\s*)?0(?:\.00)?(\s*usd)?$/i;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isCollectionPage() {
    return (
      document.body.classList.contains('template-collection') ||
      window.location.pathname.startsWith('/collections/')
    );
  }

  function hideZeroPriceNodes() {
    if (!isCollectionPage()) return;

    const priceNodes = document.querySelectorAll(
      [
        '.price',
        '.Price',
        '.ProductItem__Price',
        '.product-card__price',
        '.card-information .price',
        '[class*="price"]',
      ].join(','),
    );

    priceNodes.forEach((node) => {
      const text = clean(node.textContent);
      if (!text) return;

      if (ZERO_PRICE_PATTERN.test(text)) {
        node.style.display = 'none';
        node.setAttribute('aria-hidden', 'true');
      }
    });
  }

  hideZeroPriceNodes();
  document.addEventListener('shopify:section:load', hideZeroPriceNodes);
  document.addEventListener('collection:updated', hideZeroPriceNodes);
})();
