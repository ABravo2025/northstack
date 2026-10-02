// Fills every price on the landing (EN and /es/) from the app's single price source —
// src/config/pricing.ts on the main branch, served by the public GET /api/plans/prices.
// No price is typed into the HTML: elements render "—" until this lands.
//
// Per-user pricing (2026-10-02): the page's own calculator (see index.html) renders the plan
// cards; this file only fetches, exposes the data as window.northstackPricing + the
// `northstack:pricing` event, fills the simple [data-pricing] labels and the JSON-LD offers.
(function () {
  var API = 'https://app.joinnorthstack.com/api/plans/prices';

  function money(cents, currency) {
    var amount = cents / 100;
    return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
      style: 'currency',
      currency: currency,
      currencyDisplay: currency === 'ARS' ? 'code' : 'symbol',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  }

  fetch(API)
    .then(function (res) {
      if (!res.ok) throw new Error('prices ' + res.status);
      return res.json();
    })
    .then(function (pricing) {
      var detail = { pricing: pricing, money: money };
      window.northstackPricing = detail;
      window.dispatchEvent(new CustomEvent('northstack:pricing', { detail: detail }));

      var intl = pricing.markets.international;
      var values = {
        'min-users': String(pricing.minUsers || ''),
        'trial-cap': String(pricing.freeTrialSeatCap || ''),
      };
      document.querySelectorAll('[data-pricing]').forEach(function (el) {
        var value = values[el.getAttribute('data-pricing')];
        if (value) el.textContent = value;
      });

      var ld = document.getElementById('ld-app');
      if (ld && intl && intl.perUser) {
        var data = JSON.parse(ld.textContent);
        var tier = pricing.isLaunch ? 'launch' : 'regular';
        data.offers = ['starter', 'growth'].map(function (plan) {
          return {
            '@type': 'Offer',
            name: plan === 'starter' ? 'Starter' : 'Growth',
            price: String(intl.perUser[tier][plan] / 100),
            priceCurrency: intl.currency,
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: String(intl.perUser[tier][plan] / 100),
              priceCurrency: intl.currency,
              unitText: 'user per month',
            },
          };
        });
        ld.textContent = JSON.stringify(data);
      }
    })
    .catch(function () {
      // Leave the "—" placeholders — better than a number that might be wrong.
    });
})();
