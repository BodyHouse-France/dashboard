/* ═══════════════════════════════════════════════════════════════
   BODY HOUSE — Nouvelles boutiques (BHDOR) · module de données
   Source : Google Sheet « BOUTIQUES BH_Follow-up 2026 », onglet
   « PERFORMANCES BOUTIQUES BHDOR 2026 », publié sur le web (CSV).
   Même structure que PERFORMANCES BOUTIQUES 2026 : un bloc de
   36 lignes par boutique, colonnes journalières F → NR.
   Ajouter une boutique = ajouter une ligne dans BOUTIQUES.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PUB_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSXUlg5-6tPscJUJlh1WyhplAlX1VEqVJoB34GmPStGweo4abDmyGqZnnOS_wbUMe45TYwz1FHVjdzD/pub?output=csv&single=true&gid=';
  var GID_PERF = '1403628117';
  var YEAR = 2026;
  var CACHE_KEY = 'bhdor_perf_csv_v1';
  var CACHE_TTL = 10 * 60 * 1000;

  // key = libellé exact de la ligne ville dans l'onglet (colonne A)
  var BOUTIQUES = [
    { key: 'BAYONNE', name: 'Bayonne', slug: 'bayonne' },
    { key: 'LA ROCHELLE', name: 'La Rochelle', slug: 'la-rochelle' },
    { key: 'LORIENT', name: 'Lorient', slug: 'lorient' },
    { key: 'BREST', name: 'Brest', slug: 'brest' },
    { key: 'CAEN', name: 'Caen', slug: 'caen' },
    { key: 'BORDEAUX', name: 'Bordeaux', slug: 'bordeaux' },
    { key: 'RENNES', name: 'Rennes', slug: 'rennes' },
    { key: 'NANTES', name: 'Nantes', slug: 'nantes' },
    { key: 'LE MANS', name: 'Le Mans', slug: 'le-mans' },
    { key: 'ANGERS', name: 'Angers', slug: 'angers' },
    { key: 'TOURS', name: 'Tours', slug: 'tours' },
    { key: 'ROUEN', name: 'Rouen', slug: 'rouen' },
    { key: 'LIMOGES', name: 'Limoges', slug: 'limoges' },
    { key: 'LILLE', name: 'Lille', slug: 'lille' },
    { key: 'POITIERS', name: 'Poitiers', slug: 'poitiers' }
  ];

  // [colonne du 1er jour, nb jours, colonne sous-total du mois] (index 0 = colonne A)
  var MONTH_COLS = [
    [5, 31, 36], [37, 28, 65], [66, 31, 97], [98, 30, 128], [129, 31, 160], [161, 30, 191],
    [192, 31, 223], [224, 31, 255], [256, 30, 286], [287, 31, 318], [319, 30, 349], [350, 31, 381]
  ];

  // Décalage de ligne depuis la ligne « VILLE » du bloc
  var ROWS = {
    meta_imp: 2, meta_clics: 3, meta_eng: 4, meta_dep: 5,
    google_imp: 8, google_clics: 9, google_conv: 10, google_dep: 11,
    gmb_imp: 14, appels: 15, itineraires: 16, notes: 17,
    visites: 20, users: 21, temps: 22, rebond: 23,
    ca: 26, tickets: 27, ca_n1: 29, tickets_n1: 30
  };
  var AVG_ROWS = { temps: 1, rebond: 1, notes: 1 }; // cellules vides = pas de donnée (NaN)
  var BUDGET_ROWS = { meta: 1, google: 7 };

  var MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  var MONTHS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  var WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  var MONTH_START = [];
  (function () { var s = 0; for (var m = 0; m < 12; m++) { MONTH_START.push(s); s += MONTH_COLS[m][1]; } })();
  var DAYS = MONTH_START[11] + MONTH_COLS[11][1]; // 365

  /* ── CSV ── */
  function csvLine(l) {
    var r = [], c = '', q = false;
    for (var i = 0; i < l.length; i++) {
      var ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; }
      else if (ch === ',' && !q) { r.push(c); c = ''; }
      else c += ch;
    }
    r.push(c);
    return r;
  }
  function pNum(v) {
    if (v === undefined || v === null) return NaN;
    var s = String(v).trim();
    if (!s) return NaN;
    s = s.replace(/[\s\u00a0\u202f]/g, '').replace(/[€%]/g, '').replace(/,/g, '.');
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }

  function parse(text) {
    var lines = text.replace(/\r\n/g, '\n').split('\n');
    var byKey = {};
    BOUTIQUES.forEach(function (b) { byKey[b.key] = b; });
    var out = {};
    for (var i = 0; i < lines.length; i++) {
      var label = (csvLine(lines[i])[0] || '').trim().toUpperCase();
      var b = byKey[label];
      if (!b || out[b.key]) continue;
      var s = {};
      Object.keys(ROWS).forEach(function (metric) {
        var f = csvLine(lines[i + ROWS[metric]] || '');
        var arr = new Float64Array(DAYS);
        for (var m = 0; m < 12; m++) {
          var c0 = MONTH_COLS[m][0], n = MONTH_COLS[m][1], d0 = MONTH_START[m];
          for (var d = 0; d < n; d++) {
            var v = pNum(f[c0 + d]);
            arr[d0 + d] = AVG_ROWS[metric] ? v : (isNaN(v) ? 0 : v);
          }
        }
        s[metric] = arr;
      });
      var budgets = {};
      Object.keys(BUDGET_ROWS).forEach(function (k) {
        var f = csvLine(lines[i + BUDGET_ROWS[k]] || '');
        budgets[k] = MONTH_COLS.map(function (mc) { var v = pNum(f[mc[2]]); return isNaN(v) ? 0 : v; });
      });
      out[b.key] = { key: b.key, name: b.name, slug: b.slug, s: s, budgets: budgets };
    }
    return out;
  }

  /* ── Chargement (avec cache de session) ── */
  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || Date.now() - o.t > CACHE_TTL) return null;
      return o;
    } catch (e) { return null; }
  }
  function writeCache(text) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), text: text })); } catch (e) { /* quota / mode privé */ }
  }

  function load(opts) {
    opts = opts || {};
    var cached = opts.force ? null : readCache();
    var p = cached ? Promise.resolve({ text: cached.text, t: cached.t }) :
      fetch(PUB_BASE + GID_PERF, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(function (text) { writeCache(text); return { text: text, t: Date.now() }; });
    return p.then(function (res) {
      var data = parse(res.text);
      var keys = Object.keys(data);
      if (!keys.length) throw new Error('Aucun bloc boutique trouvé dans l\'onglet');
      var range = activeRange(keys.map(function (k) { return data[k]; }));
      return { boutiques: data, firstDoy: range.first, lastDoy: range.last, fetchedAt: new Date(res.t) };
    });
  }

  /* ── Dates ── */
  function doyToDate(doy) { return new Date(YEAR, 0, 1 + doy); }
  function dateToDoy(d) {
    if (typeof d === 'string') { var p = d.split('-'); d = new Date(+p[0], +p[1] - 1, +p[2]); }
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(YEAR, 0, 1)) / 86400000);
  }
  function doyToIso(doy) {
    var d = doyToDate(doy);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function doyMonth(doy) { for (var m = 11; m >= 0; m--) if (doy >= MONTH_START[m]) return m; return 0; }
  function monthRange(m) { return [MONTH_START[m], MONTH_START[m] + MONTH_COLS[m][1] - 1]; }
  function fmtDay(doy) { var d = doyToDate(doy); return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()].toLowerCase(); }
  function fmtDayShort(doy) { var d = doyToDate(doy); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  function weekday(doy) { return (doyToDate(doy).getDay() + 6) % 7; } // 0 = lundi

  var CORE = ['meta_imp', 'google_imp', 'gmb_imp', 'visites', 'ca', 'tickets'];
  function activeRange(list) {
    var first = DAYS, last = -1;
    list.forEach(function (b) {
      CORE.forEach(function (k) {
        var a = b.s[k];
        for (var d = 0; d < DAYS; d++) if (a[d] > 0) { if (d < first) first = d; break; }
        for (var e = DAYS - 1; e >= 0; e--) if (a[e] > 0) { if (e > last) last = e; break; }
      });
    });
    if (last < 0) { first = 0; last = dateToDoy(new Date()); }
    return { first: first, last: Math.min(last, DAYS - 1) };
  }

  /* ── Périodes ── */
  function preset(name, ctx) {
    var last = ctx.lastDoy, first = ctx.firstDoy;
    switch (name) {
      case 'annual': return { a: 0, b: DAYS - 1, mode: 'annual' };
      case 'since': return { a: first, b: last, mode: 'since' };
      case 't1': return { a: monthRange(0)[0], b: monthRange(2)[1], mode: 'range' };
      case 't2': return { a: monthRange(3)[0], b: monthRange(5)[1], mode: 'range' };
      case 't3': return { a: monthRange(6)[0], b: monthRange(8)[1], mode: 'range' };
      case 't4': return { a: monthRange(9)[0], b: monthRange(11)[1], mode: 'range' };
      case 's1': return { a: monthRange(0)[0], b: monthRange(5)[1], mode: 'range' };
      case 's2': return { a: monthRange(6)[0], b: monthRange(11)[1], mode: 'range' };
      case 'last30': return { a: Math.max(0, last - 29), b: last, mode: 'range' };
      case 'lastmonth': { var m = Math.max(0, doyMonth(last) - 1); var r = monthRange(m); return { a: r[0], b: r[1], mode: 'range' }; }
      default:
        if (/^m\d+$/.test(name)) { var mr = monthRange(+name.slice(1)); return { a: mr[0], b: mr[1], mode: 'range' }; }
        return { a: 0, b: DAYS - 1, mode: 'annual' };
    }
  }
  function periodLabel(p) {
    if (p.mode === 'annual') return 'Cumul annuel — ' + YEAR;
    if (p.mode === 'since') return 'Depuis l\'ouverture — ' + YEAR;
    var ma = doyMonth(p.a), mb = doyMonth(p.b);
    var fullA = p.a === MONTH_START[ma], fullB = p.b === monthRange(mb)[1];
    if (fullA && fullB) return ma === mb ? MONTHS_LONG[ma] + ' ' + YEAR : MONTHS_LONG[ma] + ' — ' + MONTHS_LONG[mb] + ' ' + YEAR;
    if (p.a === p.b) return fmtDay(p.a) + ' ' + YEAR;
    return fmtDay(p.a) + ' — ' + fmtDay(p.b) + ' ' + YEAR;
  }
  // Partie de la période qui contient réellement des données (pour les graphiques)
  function effective(p, ctx) {
    var a = Math.max(p.a, ctx.firstDoy), b = Math.min(p.b, ctx.lastDoy);
    return a > b ? null : { a: a, b: b };
  }

  /* ── Agrégations ── */
  function sum(arr, a, b) { var t = 0; for (var d = a; d <= b; d++) t += arr[d] || 0; return t; }
  function wavg(val, w, a, b) {
    var t = 0, ww = 0;
    for (var d = a; d <= b; d++) { var v = val[d]; if (!isNaN(v)) { var k = w ? (w[d] || 0) : 1; t += v * k; ww += k; } }
    return ww > 0 ? t / ww : NaN;
  }
  function budgetFor(months, a, b) {
    // budget mensuel au prorata des jours de la période
    var t = 0;
    for (var m = 0; m < 12; m++) {
      var r = monthRange(m), lo = Math.max(r[0], a), hi = Math.min(r[1], b);
      if (lo <= hi) t += (months[m] || 0) * (hi - lo + 1) / (r[1] - r[0] + 1);
    }
    return t;
  }
  function totals(b, a, z) {
    var s = b.s, o = {};
    ['meta_imp', 'meta_clics', 'meta_eng', 'meta_dep', 'google_imp', 'google_clics', 'google_conv', 'google_dep',
      'gmb_imp', 'appels', 'itineraires', 'visites', 'users', 'ca', 'tickets', 'ca_n1', 'tickets_n1'].forEach(function (k) { o[k] = sum(s[k], a, z); });
    o.temps = wavg(s.temps, s.visites, a, z);
    o.rebond = wavg(s.rebond, s.visites, a, z);
    o.note = wavg(s.notes, null, a, z);
    o.budget_meta = budgetFor(b.budgets.meta, a, z);
    o.budget_google = budgetFor(b.budgets.google, a, z);
    o.dep = o.meta_dep + o.google_dep;
    o.imp = o.meta_imp + o.google_imp;
    o.clics = o.meta_clics + o.google_clics;
    o.panier = o.tickets > 0 ? o.ca / o.tickets : 0;
    var open = 0; for (var d = a; d <= z; d++) if (s.tickets[d] > 0) open++;
    o.jours_ouverts = open;
    return o;
  }
  function addTotals(list) {
    var o = null;
    list.forEach(function (t) {
      if (!o) { o = {}; Object.keys(t).forEach(function (k) { o[k] = 0; }); o._tw = 0; o._rw = 0; o._v = 0; }
      Object.keys(t).forEach(function (k) { if (typeof t[k] === 'number' && !isNaN(t[k])) o[k] += t[k]; });
      if (!isNaN(t.temps)) { o._tw += t.temps * t.visites; o._v += t.visites; }
      if (!isNaN(t.rebond)) o._rw += t.rebond * t.visites;
    });
    if (!o) return null;
    o.temps = o._v > 0 ? o._tw / o._v : NaN;
    o.rebond = o._v > 0 ? o._rw / o._v : NaN;
    o.panier = o.tickets > 0 ? o.ca / o.tickets : 0;
    o.note = NaN;
    return o;
  }

  // Découpage pour les graphiques : par jour si ≤ 62 jours, sinon par mois
  function buckets(a, b) {
    var out = [];
    if (b - a + 1 <= 62) {
      for (var d = a; d <= b; d++) out.push({ label: fmtDayShort(d), title: fmtDay(d), a: d, b: d });
    } else {
      for (var m = doyMonth(a); m <= doyMonth(b); m++) {
        var r = monthRange(m);
        var lo = Math.max(r[0], a), hi = Math.min(r[1], b);
        var partial = lo > r[0] || hi < r[1];
        out.push({ label: MONTHS_SHORT[m], title: MONTHS_LONG[m] + (partial ? ' (' + fmtDay(lo) + ' → ' + fmtDay(hi) + ')' : ''), a: lo, b: hi });
      }
    }
    return out;
  }
  function series(arr, bk) { return bk.map(function (x) { return sum(arr, x.a, x.b); }); }
  function seriesSumOf(list, metric, bk) {
    return bk.map(function (x) { var t = 0; list.forEach(function (b) { t += sum(b.s[metric], x.a, x.b); }); return t; });
  }
  function seriesWavg(val, w, bk) { return bk.map(function (x) { var v = wavg(val, w, x.a, x.b); return isNaN(v) ? null : v; }); }

  /* ── Formats ── */
  function fmtNum(n) { return Math.round(n || 0).toLocaleString('fr-FR'); }
  function fmtEur(n) { return Math.round(n || 0).toLocaleString('fr-FR') + ' €'; }
  function fmtEur2(n) { return (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function fmtDec(n, d) { return (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function fmtShort(n) {
    n = n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1e4) return Math.round(n / 1e3) + 'K';
    return fmtNum(n);
  }
  function fmtDuration(sec) {
    if (isNaN(sec)) return '—';
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m > 0 ? m + ' min ' + String(s).padStart(2, '0') + ' s' : s + ' s';
  }
  function fmtPct(n, d) { return isNaN(n) ? '—' : fmtDec(n, d === undefined ? 1 : d) + ' %'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  global.BHDOR = {
    YEAR: YEAR, DAYS: DAYS, BOUTIQUES: BOUTIQUES, MONTH_START: MONTH_START,
    MONTHS_SHORT: MONTHS_SHORT, MONTHS_LONG: MONTHS_LONG, WEEKDAYS: WEEKDAYS,
    load: load, parse: parse, csvLine: csvLine,
    doyToDate: doyToDate, dateToDoy: dateToDoy, doyToIso: doyToIso, doyMonth: doyMonth, monthRange: monthRange,
    fmtDay: fmtDay, fmtDayShort: fmtDayShort, weekday: weekday,
    preset: preset, periodLabel: periodLabel, effective: effective, activeRange: activeRange,
    sum: sum, wavg: wavg, totals: totals, addTotals: addTotals,
    buckets: buckets, series: series, seriesSumOf: seriesSumOf, seriesWavg: seriesWavg,
    fmtNum: fmtNum, fmtEur: fmtEur, fmtEur2: fmtEur2, fmtDec: fmtDec, fmtShort: fmtShort,
    fmtDuration: fmtDuration, fmtPct: fmtPct, esc: esc,
    bySlug: function (slug) { for (var i = 0; i < BOUTIQUES.length; i++) if (BOUTIQUES[i].slug === slug) return BOUTIQUES[i]; return null; }
  };
})(window);
