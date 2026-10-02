// Fills every price and seat number on the landing (EN and /es/) from the app's single price
// source — src/config/pricing.ts on the main branch, served by the public GET /api/plans/prices.
// No price is typed into the HTML: elements carry data-pricing="<key>" and render "—" until this
// lands. The SoftwareApplication JSON-LD (#ld-app) gets its `offers` added here too.
(function () {
  var API = 'https://app.joinnorthstack.com/api/plans/prices';

  function money(cents, currency) {
    var amount = cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  }

  fetch(API)
    .then(function (res) {
      if (!res.ok) throw new Error('prices ' + res.status);
      return res.json();
    })
    .then(function (pricing) {
      // The landing advertises the international (USD) prices; Argentina's ARS prices are shown
      // in-app once the workspace's country is known.
      var market = pricing.markets.international;
      var values = {
        'price-starter': money(market.plans.starter, market.currency),
        'price-growth': money(market.plans.growth, market.currency),
        'seat-price': money(market.extraSeat, market.currency),
        'seats-starter': String(pricing.includedSeats.starter),
        'seats-growth': String(pricing.includedSeats.growth),
      };
      // The team-size calculator on the landing (v2) needs the raw numbers, not just the labels.
      var detail = {
        currency: market.currency,
        plans: { starter: market.plans.starter, growth: market.plans.growth },
        extraSeat: market.extraSeat,
        included: { starter: pricing.includedSeats.starter, growth: pricing.includedSeats.growth },
        money: function (cents) { return money(cents, market.currency); },
      };
      document.querySelectorAll('[data-pricing]').forEach(function (el) {
        var value = values[el.getAttribute('data-pricing')];
        if (value != null) el.textContent = value;
      });

      // After the [data-pricing] labels above, so the calculator's per-team totals win over the base price.
      window.northstackPricing = detail;
      window.dispatchEvent(new CustomEvent('northstack:pricing', { detail: detail }));

      var ld = document.getElementById('ld-app');
      if (ld) {
        var data = JSON.parse(ld.textContent);
        data.offers = ['starter', 'growth'].map(function (plan) {
          return {
            '@type': 'Offer',
            name: plan === 'starter' ? 'Starter' : 'Growth',
            price: String(market.plans[plan] / 100),
            priceCurrency: market.currency,
          };
        });
        ld.textContent = JSON.stringify(data);
      }
    })
    .catch(function () {
      // Leave the "—" placeholders — better than a number that might be wrong.
    });
})();
