(() => {
  const root = document.querySelector('[data-dspln-cart-shipping-estimator]');
  if (!root) return;

  const countryInput = root.querySelector('[data-shipping-country]');
  const zipInput = root.querySelector('[data-shipping-zip]');
  const button = root.querySelector('[data-shipping-estimate]');
  const result = root.querySelector('[data-shipping-result]');

  function setResult(message) {
    if (result) result.textContent = message;
  }

  function ratesUrl(country, zip) {
    const params = new URLSearchParams();
    params.set('shipping_address[country]', country);
    params.set('shipping_address[zip]', zip);
    return `/cart/shipping_rates.json?${params.toString()}`;
  }

  async function estimate() {
    const country = countryInput?.value?.trim() || '';
    const zip = zipInput?.value?.trim() || '';

    if (!country || !zip) {
      setResult('Enter a country and zip code to estimate shipping.');
      return;
    }

    button.disabled = true;
    setResult('Estimating...');

    try {
      const response = await fetch(ratesUrl(country, zip), {
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setResult(payload?.message || 'Shipping rates are not available for that address.');
        return;
      }

      const rates = payload?.shipping_rates || [];
      if (!rates.length) {
        setResult('No shipping rates found for that address.');
        return;
      }

      const firstRate = rates[0];
      setResult(`${firstRate.name}: ${firstRate.price}`);
    } catch {
      setResult('Shipping rates could not be estimated right now.');
    } finally {
      button.disabled = false;
    }
  }

  button?.addEventListener('click', estimate);
})();
