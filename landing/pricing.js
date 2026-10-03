// Fills every price on the landing (EN and /es/, home and module pages) from the app's single price
// source — src/config/pricing.ts on the main branch, served by the public GET /api/plans/prices.
// No price is typed into the HTML: elements render "—" until this lands.
//
// Currency (2026-10-03, Alejandro): no switch — visitors in Argentina (by IP, from the app's
// /api/public/geo, which reads Vercel's edge geolocation) see ARS, everyone else USD. If the geo
// lookup fails, the browser's timezone/locale is the fallback.
//
// Exposes window.northstackPricing = { pricing, market, money } + the `northstack:pricing` event
// (the home page's calculator listens), and renders the simple module-page markup itself:
//   [data-ns-now="starter|growth"]  per-user price today
//   [data-ns-reg="starter|growth"]  regular price (struck through, only during the launch)
//   [data-ns-off="starter|growth"]  "-40%" badge (hidden outside the launch)
//   [data-ns-launch]                launch line; template in the attribute value ({date}, {pct})
//   [data-pricing="min-users"|"trial-cap"]
(function () {
  var APP = 'https://app.joinnorthstack.com';

  function money(cents, currency) {
    var amount = cents / 100;
    return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
      style: 'currency',
      currency: currency,
      currencyDisplay: currency === 'ARS' ? 'code' : 'symbol',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  }

  function fallbackMarket() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz.indexOf('America/Argentina') === 0 || tz === 'America/Buenos_Aires') return 'ar';
    } catch (e) {}
    return 'international';
  }

  var geo = fetch(APP + '/api/public/geo', { cache: 'no-store' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (g) { return g && g.country ? (g.country === 'AR' ? 'ar' : 'international') : fallbackMarket(); })
    .catch(fallbackMarket);

  var prices = fetch(APP + '/api/plans/prices').then(function (res) {
    if (!res.ok) throw new Error('prices ' + res.status);
    return res.json();
  });

  Promise.all([prices, geo])
    .then(function (both) {
      var pricing = both[0], market = both[1];
      var m = pricing.markets[market] && pricing.markets[market].perUser ? pricing.markets[market] : pricing.markets.international;
      if (!m || !m.perUser) return;
      var tier = pricing.isLaunch ? 'launch' : 'regular';
      var fmt = function (c) { return money(c, m.currency); };

      var detail = { pricing: pricing, market: m === pricing.markets.ar ? 'ar' : 'international', money: money };
      window.northstackPricing = detail;
      window.dispatchEvent(new CustomEvent('northstack:pricing', { detail: detail }));

      var maxPct = 0;
      ['starter', 'growth'].forEach(function (plan) {
        var now = m.perUser[tier][plan], reg = m.perUser.regular[plan];
        var pct = pricing.isLaunch && reg > 0 ? Math.round((1 - now / reg) * 100) : 0;
        if (pct > maxPct) maxPct = pct;
        document.querySelectorAll('[data-ns-now="' + plan + '"]').forEach(function (el) { el.textContent = fmt(now); });
        document.querySelectorAll('[data-ns-reg="' + plan + '"]').forEach(function (el) { el.textContent = pct ? fmt(reg) : ''; });
        document.querySelectorAll('[data-ns-off="' + plan + '"]').forEach(function (el) { el.hidden = !pct; el.textContent = '-' + pct + '%'; });
      });
      var lang = document.documentElement.lang === 'es' ? 'es-AR' : 'en-US';
      document.querySelectorAll('[data-ns-launch]').forEach(function (el) {
        if (!pricing.isLaunch) { el.hidden = true; return; }
        var date = new Date(pricing.launchEndsAt + 'T12:00:00Z').toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
        el.textContent = el.getAttribute('data-ns-launch').replace('{date}', date).replace('{pct}', maxPct);
        el.hidden = false;
      });

      var values = { 'min-users': String(pricing.minUsers || ''), 'trial-cap': String(pricing.freeTrialSeatCap || '') };
      document.querySelectorAll('[data-pricing]').forEach(function (el) {
        var value = values[el.getAttribute('data-pricing')];
        if (value) el.textContent = value;
      });

      var ld = document.getElementById('ld-app');
      var intl = pricing.markets.international;
      if (ld && intl && intl.perUser) {
        var data = JSON.parse(ld.textContent);
        data.offers = ['starter', 'growth'].map(function (plan) {
          var p = String(intl.perUser[tier][plan] / 100);
          return {
            '@type': 'Offer',
            name: plan === 'starter' ? 'Starter' : 'Growth',
            price: p,
            priceCurrency: intl.currency,
            priceSpecification: { '@type': 'UnitPriceSpecification', price: p, priceCurrency: intl.currency, unitText: 'user per month' },
          };
        });
        ld.textContent = JSON.stringify(data);
      }
    })
    .catch(function () {
      // Leave the "—" placeholders — better than a number that might be wrong.
    });
})();
