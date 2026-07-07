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

  const US_ZIP_RANGES = [
    ['005', '005', 'New York'],
    ['006', '009', 'Puerto Rico'],
    ['010', '027', 'Massachusetts'],
    ['028', '029', 'Rhode Island'],
    ['030', '038', 'New Hampshire'],
    ['039', '049', 'Maine'],
    ['050', '059', 'Vermont'],
    ['060', '069', 'Connecticut'],
    ['070', '089', 'New Jersey'],
    ['090', '099', 'Armed Forces Americas'],
    ['100', '149', 'New York'],
    ['150', '196', 'Pennsylvania'],
    ['197', '199', 'Delaware'],
    ['200', '205', 'District of Columbia'],
    ['206', '219', 'Maryland'],
    ['220', '246', 'Virginia'],
    ['247', '268', 'West Virginia'],
    ['270', '289', 'North Carolina'],
    ['290', '299', 'South Carolina'],
    ['300', '319', 'Georgia'],
    ['320', '349', 'Florida'],
    ['350', '369', 'Alabama'],
    ['370', '385', 'Tennessee'],
    ['386', '397', 'Mississippi'],
    ['398', '399', 'Georgia'],
    ['400', '427', 'Kentucky'],
    ['430', '459', 'Ohio'],
    ['460', '479', 'Indiana'],
    ['480', '499', 'Michigan'],
    ['500', '528', 'Iowa'],
    ['530', '549', 'Wisconsin'],
    ['550', '567', 'Minnesota'],
    ['570', '577', 'South Dakota'],
    ['580', '588', 'North Dakota'],
    ['590', '599', 'Montana'],
    ['600', '629', 'Illinois'],
    ['630', '658', 'Missouri'],
    ['660', '679', 'Kansas'],
    ['680', '693', 'Nebraska'],
    ['700', '715', 'Louisiana'],
    ['716', '729', 'Arkansas'],
    ['730', '749', 'Oklahoma'],
    ['750', '799', 'Texas'],
    ['800', '816', 'Colorado'],
    ['820', '831', 'Wyoming'],
    ['832', '838', 'Idaho'],
    ['840', '847', 'Utah'],
    ['850', '865', 'Arizona'],
    ['870', '884', 'New Mexico'],
    ['889', '898', 'Nevada'],
    ['900', '961', 'California'],
    ['967', '968', 'Hawaii'],
    ['970', '979', 'Oregon'],
    ['980', '994', 'Washington'],
    ['995', '999', 'Alaska'],
  ];

  function inferUsProvince(zip) {
    const prefix = zip.replace(/\D/g, '').slice(0, 3);
    if (prefix.length < 3) return '';

    const match = US_ZIP_RANGES.find(([start, end]) => prefix >= start && prefix <= end);
    return match?.[2] || '';
  }

  function ratesUrl(country, zip) {
    const params = new URLSearchParams();
    params.set('shipping_address[country]', country);
    params.set('shipping_address[zip]', zip);

    if (country === 'United States') {
      const province = inferUsProvince(zip);
      if (province) params.set('shipping_address[province]', province);
    }

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
