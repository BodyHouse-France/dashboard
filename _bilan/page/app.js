/* Bilan des boutiques Body House (nouvelles / historiques) : affichage, onglets, tableaux et graphiques. */
(() => {
  const C = { bordeaux: '#a64551', fonce: '#7f2f3b', corail: '#e2806b', rose: '#f1dbcf', nude: '#f8ede7', encre: '#242424', gris: '#6b5f5c', pale: '#e9c9bb', temoin: '#c9a89a', n1: '#b9a39a', pause: '#ece3de', grille: '#efe0d7' };
  const LOC = d3.formatLocale({ decimal: ',', thousands: ' ', grouping: [3], currency: ['', ' €'], minus: '-', percent: ' %' });
  const nombre = LOC.format(',.0f');
  const dec2 = LOC.format(',.2f');
  const dec1 = LOC.format(',.1f');
  const euros = (v) => {
    const a = Math.abs(v);
    if (a >= 100) return nombre(v) + ' €';
    if (a >= 0.01 || a === 0) return dec2(v) + ' €';
    return LOC.format(',.4f')(v) + ' €';
  };
  const pct = (v) => dec1(v * 100) + ' %';
  const pctSigne = (v) => (v > 0 ? '+' : '') + dec1(v * 100) + ' %';
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const jourCourt = (d) => `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
  const versDate = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');

  const EUROS = /^(depense|ca_|panier|cout|cpc|cpm)/;
  const POURCENT = /^(ctr|part_)/;
  const format = (champ, v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'string' && !/^-?[\d.]+(e-?\d+)?$/.test(v)) return v;
    const n = Number(v);
    if (Number.isNaN(n)) return '—';
    if (champ.startsWith('evol_')) return pctSigne(n);
    if (POURCENT.test(champ)) return pct(n);
    if (EUROS.test(champ)) return euros(n);
    if (champ === 'repetition') return dec2(n);
    return nombre(n);
  };
  const classeEvol = (champ, v) => {
    if (!champ.startsWith('evol_') || v === null || v === undefined) return '';
    const n = Number(v);
    if (Math.abs(n) < 0.02) return 'bh-neutre';
    return n > 0 ? 'bh-hausse' : 'bh-baisse';
  };

  /* ---------- données ---------- */
  const lire = (id) => dash.data(id);
  const lignes = (id) => { const d = lire(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const etat = (ids) => {
    const s = ids.map((id) => lire(id).status);
    if (s.every((x) => x === 'ok')) return 'ok';
    if (s.some((x) => x === 'error' || x === 'declined' || x === 'connect' || x === 'missing')) return 'erreur';
    return 'attente';
  };
  const parseWhere = (w) => (w ? w.split('&').map((p) => p.split('=').map(decodeURIComponent)) : []);
  const ligneMarque = (el) => {
    const rows = lignes(el.dataset.source);
    if (!rows.length) return null;
    if (el.dataset.row !== undefined) return rows[Number(el.dataset.row)] || null;
    const conds = parseWhere(el.dataset.where);
    if (!conds.length) return rows[0];
    return rows.find((r) => conds.every(([k, v]) => String(r[k]) === v)) || null;
  };

  /* ---------- état de la page ---------- */
  const racine = document.getElementById('bilan');
  const PAGES = ['synthese', 'meta', 'google', 'fiches', 'ventes', 'boutique'];
  let pageActive = 'synthese';
  const mode = () => (dash.params().reseau === 'historiques' ? 'historiques' : 'nouvelles');
  const autreMode = () => (mode() === 'historiques' ? 'nouvelles' : 'historiques');
  const visible = (el) => !el.classList.contains('si-' + autreMode());
  const boutiqueActive = () => {
    const rows = lignes('boutiques');
    const b = dash.params().boutique;
    return rows.some((r) => r.boutique === b) ? b : ((rows[0] || {}).boutique || '');
  };

  /* ---------- périodes (écrites à chaque mise à jour dans « parametres ») ---------- */
  const P = () => lignes('parametres')[0] || {};
  const pendant = () => P().pendant || [];
  const lundi = (d) => d3.utcMonday.floor(d);
  const jalonsDe = (type, minJours = 0) => lignes('jalons').filter((j) => j.type === type)
    .map((j) => ({ debut: versDate(j.debut), fin: d3.utcDay.offset(versDate(j.fin), 1) }))
    .filter((j) => (j.fin - j.debut) / 864e5 >= minJours);
  const bandePendant = (finMax) => {
    const p = pendant();
    if (!p.length) return [];
    let fin = versDate(p[p.length - 1]);
    if (finMax && finMax < fin) fin = finMax;
    return [{ debut: versDate(p[0]), fin, couleur: C.nude }];
  };
  const majAlerte = () => {
    const el = document.getElementById('alerte-maj');
    const t = (lignes('periode')[0] || {}).alerte || '';
    el.textContent = t;
    el.hidden = !t;
  };

  /* ---------- marques simples ---------- */
  const majMarques = () => {
    const b = boutiqueActive();
    racine.querySelectorAll('[data-bh-boutique]').forEach((el) => { el.dataset.where = 'boutique=' + b.replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D'); });
    racine.querySelectorAll('[data-source][data-field]').forEach((el) => {
      if (el.closest('table')) return;
      const st = lire(el.dataset.source).status;
      if (st !== 'ok') {
        if (st !== 'loading') { el.classList.remove('dash-skeleton'); el.textContent = '—'; }
        return;
      }
      const r = ligneMarque(el);
      const v = r ? r[el.dataset.field] : null;
      el.textContent = format(el.dataset.field, v);
      el.classList.remove('dash-skeleton', 'bh-hausse', 'bh-baisse', 'bh-neutre');
      const c = classeEvol(el.dataset.field, v);
      if (c && !el.classList.contains('bh-kpi-valeur')) el.classList.add(c);
    });
  };

  /* ---------- tableaux ---------- */
  const tris = {};
  const preparerTris = () => {
    racine.querySelectorAll('table.bh-table').forEach((t) => {
      t.querySelectorAll('th').forEach((th) => {
        if (th.querySelector('button')) return;
        const b = document.createElement('button');
        b.type = 'button';
        while (th.firstChild) b.appendChild(th.firstChild);
        th.appendChild(b);
        th.setAttribute('aria-sort', 'none');
        b.addEventListener('click', () => {
          const champ = th.dataset.field;
          const prec = tris[t.id];
          tris[t.id] = { champ, sens: prec && prec.champ === champ && prec.sens === 'descending' ? 'ascending' : 'descending' };
          rendre();
        });
      });
    });
  };
  const trier = (id, rows) => {
    const t = tris[id];
    const table = document.getElementById(id);
    table.querySelectorAll('th').forEach((th) => th.setAttribute('aria-sort', t && th.dataset.field === t.champ ? t.sens : 'none'));
    if (!t) return rows;
    const s = t.sens === 'ascending' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const x = a[t.champ]; const y = b[t.champ];
      if (typeof x === 'string' || typeof y === 'string') return s * String(x).localeCompare(String(y), 'fr');
      return s * ((x ?? -Infinity) - (y ?? -Infinity));
    });
  };
  const remplirTable = (id, rows, opts = {}) => {
    const table = document.getElementById(id);
    const tbody = table.querySelector('tbody');
    const champs = [...table.querySelectorAll('th')].filter(visible).map((th) => th.dataset.field);
    const cle = table.dataset.rowKey;
    tbody.replaceChildren();
    const st = lire(table.dataset.source).status;
    if (st !== 'ok') {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = champs.length;
      td.className = st === 'loading' ? 'dash-skeleton' : 'bh-echec';
      td.textContent = st === 'loading' ? '—' : 'Échec du chargement';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (const r of trier(id, rows)) {
      const tr = document.createElement('tr');
      tr.dataset.key = String(r[cle]);
      if (r.groupe === 'Boutiques témoins') tr.classList.add('bh-groupe-temoin');
      if (opts.surligner && opts.surligner(r)) tr.classList.add('bh-total');
      for (const c of champs) {
        const td = document.createElement('td');
        td.textContent = format(c, r[c]);
        const k = classeEvol(c, r[c]);
        if (k) td.className = k;
        tr.appendChild(td);
      }
      if (opts.clic) { tr.style.cursor = 'pointer'; tr.addEventListener('click', () => opts.clic(r)); }
      tbody.appendChild(tr);
    }
  };

  /* ---------- outils graphiques ---------- */
  const echec = (el, st) => {
    el.replaceChildren();
    if (st === 'attente') { el.classList.add('dash-skeleton'); return false; }
    el.classList.remove('dash-skeleton');
    const d = document.createElement('div');
    d.className = 'bh-echec';
    d.style.minHeight = el.style.minHeight || '200px';
    d.textContent = 'Échec du chargement';
    el.appendChild(d);
    return false;
  };
  const cadre = (el, h) => {
    el.classList.remove('dash-skeleton');
    el.replaceChildren();
    const w = Math.max(280, Math.floor(el.clientWidth));
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', h).attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'none');
    return { svg, w, h };
  };
  const largeurTexte = (svg, textes, taille = 11.5) => {
    const g = svg.append('g').attr('font-size', taille).attr('font-family', 'BH Serif, Georgia, serif');
    let m = 0;
    for (const t of textes) { const n = g.append('text').text(t).node(); m = Math.max(m, n.getComputedTextLength()); }
    g.remove();
    return m;
  };
  const styleAxe = (g) => { g.attr('font-size', null).attr('font-family', null); g.selectAll('.tick text').attr('font-size', 11.5); return g; };
  /* Info-bulle : une seule par graphique, masquée dès que le pointeur quitte le graphique ou la fenêtre. */
  const bulles = new Set();
  if (!window.__bhBulles) {
    window.__bhBulles = true;
    const toutCacher = () => bulles.forEach((b) => b.cacher());
    document.addEventListener('mouseleave', toutCacher);
    window.addEventListener('blur', toutCacher);
    window.addEventListener('scroll', toutCacher, { passive: true });
  }
  const bulle = (el, nettoyer) => {
    bulles.forEach((b) => { if (!b.el.isConnected) bulles.delete(b); });
    const d = document.createElement('div');
    d.className = 'bh-bulle';
    el.appendChild(d);
    const api = {
      el: d,
      montrer(x, y, titre, lignesB) {
        d.replaceChildren();
        const t = document.createElement('div'); t.className = 'bh-bulle-titre'; t.textContent = titre; d.appendChild(t);
        for (const [couleur, nom, val] of lignesB) {
          const l = document.createElement('div'); l.className = 'bh-bulle-ligne';
          const a = document.createElement('span');
          if (couleur) { const i = document.createElement('i'); i.style.background = couleur; a.appendChild(i); }
          a.appendChild(document.createTextNode(nom));
          const b = document.createElement('span'); b.textContent = val; b.style.fontWeight = '600';
          l.append(a, b); d.appendChild(l);
        }
        d.style.visibility = 'visible';
        const bw = d.offsetWidth; const bh = d.offsetHeight; const W = el.clientWidth;
        let left = x + 16; if (left + bw > W) left = Math.max(0, x - bw - 16);
        let top = y - bh - 12; if (top < 0) top = Math.min(y + 16, el.clientHeight - bh);
        d.style.left = left + 'px'; d.style.top = Math.max(0, top) + 'px';
      },
      cacher() { d.style.visibility = 'hidden'; if (nettoyer) nettoyer(); },
    };
    el.onpointerleave = () => api.cacher();
    bulles.add(api);
    return api;
  };
  const ticksTemps = (x, largeur, pas) => {
    const n = Math.max(2, Math.floor(largeur / pas));
    return x.ticks(n);
  };

  /* Barres horizontales */
  const barresH = (el, donnees, o) => {
    const ids = el.dataset.source.split(' ');
    const st = etat(ids);
    if (st !== 'ok') return echec(el, st);
    const rows = donnees.slice().sort((a, b) => o.tri(b) - o.tri(a));
    const hBar = 26;
    const top = 8; const bas = 26;
    const h = top + bas + rows.length * hBar;
    const { svg, w } = cadre(el, h);
    const gauche = largeurTexte(svg, rows.map((r) => r.boutique), 12.5) + 12;
    const libelles = rows.map(o.etiquette);
    const droite = largeurTexte(svg, libelles, 12) + 14;
    const max = d3.max(rows, o.valeur) || 1;
    const x = d3.scaleLinear([0, max], [gauche, w - droite]);
    const y = d3.scaleBand(rows.map((r) => r.boutique), [top, h - bas]).padding(0.28);
    const gx = svg.append('g').attr('transform', `translate(0,${h - bas})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((w - gauche - droite) / 80))).tickFormat(o.formatAxe).tickSizeOuter(0));
    styleAxe(gx);
    gx.selectAll('.tick line').attr('y2', -(h - bas - top)).attr('stroke', C.grille);
    gx.select('.domain').remove();
    svg.append('g').selectAll('text').data(rows).join('text')
      .attr('x', gauche - 10).attr('y', (r) => y(r.boutique) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
      .attr('font-size', 12.5).attr('fill', C.encre).text((r) => r.boutique);
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', gauche).attr('y', (r) => y(r.boutique)).attr('height', y.bandwidth())
      .attr('width', (r) => Math.max(1, x(o.valeur(r)) - gauche)).attr('rx', 4)
      .attr('fill', (r) => (o.couleur ? o.couleur(r) : C.bordeaux));
    svg.append('g').selectAll('text').data(rows).join('text')
      .attr('x', (r) => x(o.valeur(r)) + 6).attr('y', (r) => y(r.boutique) + y.bandwidth() / 2).attr('dy', '0.35em')
      .attr('font-size', 12).attr('fill', C.gris).text(o.etiquette);
    if (o.reference !== undefined && o.reference !== null) {
      const xr = x(o.reference);
      svg.append('line').attr('x1', xr).attr('x2', xr).attr('y1', top - 4).attr('y2', h - bas).attr('stroke', C.encre).attr('stroke-dasharray', '4 3').attr('stroke-width', 1.2);
    }
    return true;
  };

  /* Courbes dans le temps */
  const courbes = (el, o) => {
    const ids = el.dataset.source.split(' ');
    const st = etat(ids);
    if (st !== 'ok') return echec(el, st);
    const H = o.hauteur || 260;
    const { svg, w, h } = cadre(el, H);
    const top = 14; const bas = 26;
    const toutes = o.series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => v !== null && !Number.isNaN(v));
    if (o.reference !== undefined) toutes.push(o.reference);
    let [ymin, ymax] = d3.extent(toutes);
    if (!o.yAuto) ymin = 0;
    const pad = (ymax - ymin) * 0.08 || 1;
    const yDom = [o.yAuto ? ymin - pad : 0, ymax + pad];
    const yTmp = d3.scaleLinear(yDom, [h - bas, top]).nice(5);
    const gauche = largeurTexte(svg, yTmp.ticks(5).map(o.formatY)) + 10;
    const derniers = o.series[0].points.slice(-1).map((p) => jourCourt(p.x));
    const droite = Math.max(14, largeurTexte(svg, derniers) / 2 + 6);
    const x = d3.scaleUtc(o.xDom, [gauche, w - droite]);
    const y = yTmp;
    (o.bandes || []).forEach((b) => {
      svg.append('rect').attr('x', x(b.debut)).attr('width', Math.max(1, x(b.fin) - x(b.debut))).attr('y', top).attr('height', h - bas - top).attr('fill', b.couleur);
    });
    const gy = svg.append('g').attr('transform', `translate(${gauche},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(o.formatY).tickSize(-(w - gauche - droite)));
    styleAxe(gy); gy.select('.domain').remove(); gy.selectAll('.tick line').attr('stroke', C.grille);
    const valeursX = o.series[0].points.map((p) => p.x);
    const pasX = Math.max(1, Math.ceil(valeursX.length / Math.max(2, Math.floor((w - gauche - droite) / (o.pasTicks || 80)))));
    const ticksX = o.hebdo ? valeursX.filter((_, i) => i % pasX === 0) : ticksTemps(x, w - gauche - droite, o.pasTicks || 80);
    const gx = svg.append('g').attr('transform', `translate(0,${h - bas})`).call(d3.axisBottom(x).tickValues(ticksX).tickFormat(jourCourt).tickSizeOuter(0));
    styleAxe(gx);
    if (o.reference !== undefined) svg.append('line').attr('x1', gauche).attr('x2', w - droite).attr('y1', y(o.reference)).attr('y2', y(o.reference)).attr('stroke', C.encre).attr('stroke-dasharray', '4 3');
    const ligne = d3.line().x((p) => x(p.x)).y((p) => y(p.y)).defined((p) => p.y !== null && !Number.isNaN(p.y));
    for (const s of o.series) {
      svg.append('path').datum(s.points).attr('d', ligne).attr('fill', 'none').attr('stroke', s.couleur).attr('stroke-width', s.epaisseur || 2.2)
        .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('stroke-dasharray', s.pointille ? '5 4' : null);
    }
    const pts = svg.append('g');
    const bl = bulle(el, () => pts.selectAll('*').remove());
    const xs = o.series[0].points.map((p) => p.x);
    svg.append('rect').attr('x', gauche).attr('y', top).attr('width', w - gauche - droite).attr('height', h - bas - top).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx, my] = d3.pointer(ev);
        const t = x.invert(mx);
        const i = d3.minIndex(xs, (d) => Math.abs(d - t));
        const xi = xs[i];
        pts.selectAll('*').remove();
        pts.append('line').attr('x1', x(xi)).attr('x2', x(xi)).attr('y1', top).attr('y2', h - bas).attr('stroke', '#d9c3b7');
        const lignesB = [];
        for (const s of o.series) {
          const p = s.points.find((q) => +q.x === +xi);
          if (!p || p.y === null) continue;
          pts.append('circle').attr('cx', x(xi)).attr('cy', y(p.y)).attr('r', 3.5).attr('fill', s.couleur);
          lignesB.push([s.couleur, s.nom, o.formatBulle(p, s)]);
        }
        bl.montrer(x(xi) * (el.clientWidth / w), my, o.titreBulle(xi), lignesB);
      })
      .on('mouseleave', () => { pts.selectAll('*').remove(); bl.cacher(); });
    return true;
  };

  /* ---------- graphiques de la synthèse ---------- */
  const grapheChronologie = () => {
    const el = document.getElementById('graph-chronologie');
    const st = etat(['meta_jour', 'fiches_reseau_jour', 'jalons']);
    if (st !== 'ok') return echec(el, st);
    const meta = lignes('meta_jour').map((r) => ({ x: versDate(r.jour), y: Number(r.depense) }));
    const fj = lignes('fiches_reseau_jour').map((r) => ({ x: versDate(r.jour), r: Number(r.vues_recherche), m: Number(r.vues_maps) }));
    const jal = lignes('jalons');
    const H = 380;
    const { svg, w, h } = cadre(el, H);
    const debut = d3.min(meta, (d) => d.x); const fin = d3.utcDay.offset(d3.max(meta, (d) => d.x), 1);
    const marge = 12;
    const p1 = { top: 30, bas: 158 }; const p2 = { top: 204, bas: h - 26 };
    const y1 = d3.scaleLinear([0, d3.max(meta, (d) => d.y)], [p1.bas, p1.top]).nice(4);
    const y2 = d3.scaleLinear([0, d3.max(fj, (d) => Math.max(d.r, d.m))], [p2.bas, p2.top]).nice(4);
    const gauche = Math.max(largeurTexte(svg, y1.ticks(4).map((v) => nombre(v) + ' €')), largeurTexte(svg, y2.ticks(4).map(nombre))) + 10;
    const droite = 14;
    const x = d3.scaleUtc([d3.utcHour.offset(debut, -marge), d3.utcHour.offset(fin, marge)], [gauche, w - droite]);
    jal.forEach((j, i) => {
      const a = versDate(j.debut); const b = d3.utcDay.offset(versDate(j.fin), 1);
      if (j.type === 'pause') svg.append('rect').attr('x', x(a)).attr('width', x(b) - x(a)).attr('y', p1.top - 8).attr('height', p2.bas - p1.top + 8).attr('fill', C.pause);
      if (j.type === 'fiche') svg.append('rect').attr('x', x(a)).attr('width', x(b) - x(a)).attr('y', p1.top - 8).attr('height', p2.bas - p1.top + 8).attr('fill', 'rgba(226,128,107,0.22)');
      if (j.type === 'meta' || j.type === 'google') svg.append('line').attr('x1', x(a)).attr('x2', x(a)).attr('y1', p1.top - 8).attr('y2', p2.bas).attr('stroke', j.type === 'google' ? C.corail : C.fonce).attr('stroke-dasharray', '3 3');
      const g = svg.append('g').attr('transform', `translate(${x(a) + (j.type === 'meta' || j.type === 'google' ? 0 : (x(b) - x(a)) / 2)},${p1.top - 18})`);
      g.append('circle').attr('r', 8).attr('fill', j.type === 'pause' ? C.gris : j.type === 'fiche' ? C.corail : C.bordeaux);
      g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', 10.5).attr('fill', '#fff').attr('font-family', 'BH Spartan, sans-serif').text(i + 1);
    });
    const g1 = svg.append('g').attr('transform', `translate(${gauche},0)`).call(d3.axisLeft(y1).ticks(4).tickFormat((v) => nombre(v) + ' €').tickSize(-(w - gauche - droite)));
    styleAxe(g1); g1.select('.domain').remove(); g1.selectAll('.tick line').attr('stroke', C.grille);
    const g2 = svg.append('g').attr('transform', `translate(${gauche},0)`).call(d3.axisLeft(y2).ticks(4).tickFormat(nombre).tickSize(-(w - gauche - droite)));
    styleAxe(g2); g2.select('.domain').remove(); g2.selectAll('.tick line').attr('stroke', C.grille);
    const bw = Math.max(1, x(d3.utcDay.offset(debut, 1)) - x(debut) - 1.5);
    svg.append('g').selectAll('rect').data(meta).join('rect').attr('x', (d) => x(d.x) + 0.75).attr('width', bw)
      .attr('y', (d) => y1(d.y)).attr('height', (d) => p1.bas - y1(d.y)).attr('rx', Math.min(3, bw / 2)).attr('fill', C.bordeaux);
    const l = (k) => d3.line().x((d) => x(d.x) + bw / 2).y((d) => y2(d[k]));
    svg.append('path').datum(fj).attr('d', l('r')).attr('fill', 'none').attr('stroke', C.corail).attr('stroke-width', 2.2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    svg.append('path').datum(fj).attr('d', l('m')).attr('fill', 'none').attr('stroke', C.fonce).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    svg.append('text').attr('x', gauche).attr('y', p1.bas + 30).attr('font-size', 11.5).attr('fill', C.gris).text('Vues des fiches Google / jour');
    const gx = svg.append('g').attr('transform', `translate(0,${p2.bas})`).call(d3.axisBottom(x).tickValues(ticksTemps(x, w - gauche - droite, 95)).tickFormat(jourCourt).tickSizeOuter(0));
    styleAxe(gx);
    const marque = svg.append('g');
    const bl = bulle(el, () => marque.selectAll('*').remove());
    svg.append('rect').attr('x', gauche).attr('y', p1.top).attr('width', w - gauche - droite).attr('height', p2.bas - p1.top).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx, my] = d3.pointer(ev);
        const jour = d3.utcDay.floor(x.invert(mx));
        const m = meta.find((d) => +d.x === +jour);
        const f = fj.find((d) => +d.x === +jour);
        marque.selectAll('*').remove();
        marque.append('line').attr('x1', x(jour) + bw / 2).attr('x2', x(jour) + bw / 2).attr('y1', p1.top).attr('y2', p2.bas).attr('stroke', '#d9c3b7');
        const lb = [];
        if (m) lb.push([C.bordeaux, 'Dépense Meta', euros(m.y)]);
        if (f) { lb.push([C.corail, 'Vues Recherche', nombre(f.r)]); lb.push([C.fonce, 'Vues Maps', nombre(f.m)]); }
        if (!lb.length) { bl.cacher(); return; }
        bl.montrer((x(jour) + bw / 2) * (el.clientWidth / w), my, jourCourt(jour), lb);
      })
      .on('mouseleave', () => { marque.selectAll('*').remove(); bl.cacher(); });
    const liste = document.getElementById('liste-jalons');
    liste.replaceChildren();
    jal.forEach((j) => {
      const li = document.createElement('li');
      const a = versDate(j.debut); const b = versDate(j.fin);
      li.textContent = (+a === +b ? jourCourt(a) : `${jourCourt(a)} → ${jourCourt(b)}`) + ' : ' + j.libelle;
      liste.appendChild(li);
    });
    return true;
  };

  const grapheVentesIndice = () => {
    const el = document.getElementById('graph-ventes-indice');
    const rows = lignes('ventes_reseau_semaine');
    if (mode() === 'historiques') {
      const pts = (k) => rows.map((r) => ({ x: versDate(r.semaine), y: Number(r[k]), indice: Number(r.indice) }));
      const xs = rows.map((r) => versDate(r.semaine));
      return courbes(el, {
        hauteur: 300, hebdo: true, yAuto: true, xDom: [d3.min(xs) || new Date(), d3.max(xs) || new Date()],
        series: [{ nom: '2026', couleur: C.bordeaux, points: pts('ca_ht') }, { nom: '2025', couleur: C.n1, pointille: true, points: pts('ca_ht_n1') }],
        bandes: bandePendant(),
        formatY: (v) => nombre(v / 1000) + ' k€', pasTicks: 70,
        titreBulle: (d) => 'Semaine du ' + jourCourt(d),
        formatBulle: (p, s) => nombre(p.y) + ' €' + (s.nom === '2026' ? ` (${pctSigne(p.indice / 100 - 1)})` : ''),
      });
    }
    const groupes = [['Boutiques en campagne', C.bordeaux], ['Boutiques témoins', C.temoin]];
    const series = groupes.map(([g, couleur]) => ({ nom: g, couleur, points: rows.filter((r) => r.groupe === g).map((r) => ({ x: versDate(r.semaine), y: Number(r.indice), ca: Number(r.ca_ht) })) }));
    const xs = series[0].points.map((p) => p.x);
    return courbes(el, {
      hauteur: 300, series, xDom: [d3.min(xs) || new Date(), d3.max(xs) || new Date()], yAuto: true, reference: 100, hebdo: true,
      bandes: [...bandePendant(), ...jalonsDe('pause', 5).map((j) => ({ debut: j.debut, fin: d3.utcDay.offset(j.fin, -1), couleur: C.pause }))],
      formatY: (v) => nombre(v), pasTicks: 70,
      titreBulle: (d) => 'Semaine du ' + jourCourt(d),
      formatBulle: (p) => `indice ${dec1(p.y)} · ${nombre(p.ca)} €`,
    });
  };

  /* ---------- Meta ---------- */
  const graphesMeta = () => {
    const eng = lignes('meta_campagnes').filter((r) => r.levier === 'Engagement');
    const kg = lignes('kpi_global')[0];
    barresH(document.getElementById('graph-cout-interaction'), eng, {
      tri: (r) => -Number(r.cout_par_resultat), valeur: (r) => Number(r.cout_par_resultat),
      etiquette: (r) => euros(Number(r.cout_par_resultat)), formatAxe: (v) => dec2(v), reference: kg ? Number(kg.cout_interaction) : null,
      couleur: (r) => (kg && Number(r.cout_par_resultat) > Number(kg.cout_interaction) ? C.pale : C.bordeaux),
    });
    const tra = lignes('meta_campagnes').filter((r) => r.levier === 'Trafic');
    barresH(document.getElementById('graph-visites-page'), tra, {
      tri: (r) => Number(r.resultat), valeur: (r) => Number(r.resultat),
      etiquette: (r) => `${nombre(r.resultat)} · ${nombre(Number(r.abonnes_facebook) + Number(r.abonnes_instagram || 0))} abonnés`, formatAxe: (v) => nombre(v),
    });
  };

  /* ---------- Google ---------- */
  const graphesGoogle = () => {
    const g = lignes('google_campagnes');
    barresH(document.getElementById('graph-itineraires'), g, {
      tri: (r) => Number(r.itineraires), valeur: (r) => Number(r.itineraires),
      etiquette: (r) => `${nombre(r.itineraires)} · ${euros(Number(r.cout_par_itineraire))}`, formatAxe: (v) => nombre(v),
    });
    barresH(document.getElementById('graph-part-impressions'), g, {
      tri: (r) => Number(r.part_impressions), valeur: (r) => Number(r.part_impressions),
      etiquette: (r) => pct(Number(r.part_impressions)), formatAxe: (v) => LOC.format('.0%')(v),
    });
  };

  /* ---------- Fiches ---------- */
  const graphesFiches = () => {
    const fj = lignes('fiches_reseau_jour');
    const xsj = fj.map((r) => versDate(r.jour));
    courbes(document.getElementById('graph-fiches-jour'), {
      hauteur: 280,
      series: [
        { nom: 'Vues Recherche', couleur: C.corail, points: fj.map((r) => ({ x: versDate(r.jour), y: Number(r.vues_recherche) })) },
        { nom: 'Vues Maps', couleur: C.fonce, points: fj.map((r) => ({ x: versDate(r.jour), y: Number(r.vues_maps) })) },
      ],
      xDom: [d3.min(xsj) || new Date(), d3.max(xsj) || new Date()],
      bandes: jalonsDe('fiche').map((j) => ({ debut: j.debut, fin: j.fin, couleur: 'rgba(226,128,107,0.18)' })),
      formatY: nombre, pasTicks: 70, titreBulle: jourCourt, formatBulle: (p) => nombre(p.y),
    });
    const fs = lignes('fiches_reseau_semaine');
    const xs = fs.map((r) => versDate(r.semaine));
    const dom = [d3.min(xs) || new Date(), d3.max(xs) || new Date()];
    const bande = bandePendant(dom[1]);
    courbes(document.getElementById('graph-fiches-recherche'), {
      hauteur: 260, xDom: dom, bandes: bande, formatY: nombre, pasTicks: 80, hebdo: true,
      series: [
        { nom: '2026', couleur: C.bordeaux, points: fs.map((r) => ({ x: versDate(r.semaine), y: Number(r.recherche) })) },
        { nom: '2025', couleur: C.n1, pointille: true, points: fs.map((r) => ({ x: versDate(r.semaine), y: Number(r.recherche_n1) })) },
      ],
      titreBulle: (d) => 'Semaine du ' + jourCourt(d), formatBulle: (p) => nombre(p.y),
    });
    courbes(document.getElementById('graph-fiches-actions'), {
      hauteur: 260, xDom: dom, bandes: bande, formatY: nombre, pasTicks: 80, hebdo: true,
      series: [
        { nom: '2026', couleur: C.bordeaux, points: fs.map((r) => ({ x: versDate(r.semaine), y: Number(r.actions) })) },
        { nom: '2025', couleur: C.n1, pointille: true, points: fs.map((r) => ({ x: versDate(r.semaine), y: Number(r.actions_n1) })) },
      ],
      titreBulle: (d) => 'Semaine du ' + jourCourt(d), formatBulle: (p) => nombre(p.y),
    });
    const abs = document.getElementById('fiches-absentes');
    if (lire('boutiques').status === 'ok') {
      abs.textContent = lignes('boutiques').filter((r) => r.fiche_google_suivie === 'non').map((r) => r.boutique).join(', ') || 'aucune';
    }
  };

  /* ---------- Par boutique ---------- */
  const majSelecteur = () => {
    const box = document.getElementById('selecteur-boutique');
    const rows = lignes('boutiques');
    if (!rows.length) return;
    const b = boutiqueActive();
    const cle = rows.map((r) => r.boutique).join('|');
    if (box.dataset.cle !== cle) {
      box.dataset.cle = cle;
      box.replaceChildren();
      rows.forEach((r) => {
        const bt = document.createElement('button');
        bt.type = 'button';
        bt.className = 'bh-choix' + (r.groupe === 'Boutiques témoins' ? ' bh-choix-temoin' : '');
        bt.textContent = r.boutique;
        bt.dataset.boutique = r.boutique;
        bt.addEventListener('click', () => dash.setParams({ boutique: r.boutique }));
        box.appendChild(bt);
      });
    }
    box.querySelectorAll('button').forEach((bt) => bt.setAttribute('aria-pressed', String(bt.dataset.boutique === b)));
    const r = rows.find((x) => x.boutique === b) || rows[0];
    document.getElementById('boutique-nom').textContent = r.boutique;
    document.getElementById('boutique-groupe').textContent = r.groupe === 'Boutiques témoins' ? 'Témoin, sans campagne' : r.groupe === 'Boutiques historiques' ? 'Boutique historique' : 'En campagne';
    const notes = [];
    if (r.page_facebook) notes.push('Page Facebook : ' + r.page_facebook);
    if (r.ventes_suivies === 'non') notes.push('ventes non suivies dans le follow-up');
    if (r.fiche_google_suivie === 'non') notes.push('fiche Google non reliée au suivi');
    if (r.note) notes.push(r.note);
    const txt = notes.join(' · ');
    document.getElementById('boutique-page').textContent = txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : '';
  };

  const graphesBoutique = () => {
    const b = boutiqueActive();
    const el = document.getElementById('graph-boutique-ventes');
    const st = etat(['ventes_semaine']);
    const vide = (cible, texte) => { cible.classList.remove('dash-skeleton'); cible.replaceChildren(); const p = document.createElement('p'); p.className = 'bh-vide'; p.textContent = texte; cible.appendChild(p); };
    const rowsV = st === 'ok' ? lignes('ventes_semaine').filter((r) => r.boutique === b) : [];
    if (st !== 'ok') echec(el, st);
    else if (!rowsV.length) vide(el, 'Ventes non suivies dans le follow-up pour cette boutique.');
    else {
      const avecN1 = rowsV.some((r) => r.ca_ht_n1 !== undefined && r.ca_ht_n1 !== null);
      const rows = rowsV.map((r) => ({ x: versDate(r.semaine), ca: Number(r.ca_ht), n1: avecN1 ? Number(r.ca_ht_n1) : null, media: Number(r.depense_meta) + Number(r.depense_google), tk: Number(r.tickets) }));
      const { svg, w, h } = cadre(el, 280);
      const top = 14; const bas = 26;
      const y = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r.ca, r.n1 || 0)) || 1], [h - bas, top]).nice(4);
      const y2 = d3.scaleLinear([0, Math.max(100, d3.max(rows, (r) => r.media) || 0)], [h - bas, top]).nice(4);
      const gauche = largeurTexte(svg, y.ticks(4).map((v) => nombre(v) + ' €')) + 10;
      const droite = largeurTexte(svg, y2.ticks(4).map((v) => nombre(v) + ' €')) + 12;
      const x = d3.scaleBand(rows.map((r) => +r.x), [gauche, w - droite]).padding(0.25);
      const debut = pendant().length ? rows.findIndex((r) => r.x >= versDate(pendant()[0])) : -1;
      if (debut >= 0) svg.append('rect').attr('x', x(+rows[debut].x) - x.step() * x.padding() / 2).attr('width', w - droite - (x(+rows[debut].x) - x.step() * x.padding() / 2)).attr('y', top).attr('height', h - bas - top).attr('fill', C.nude);
      const gy = svg.append('g').attr('transform', `translate(${gauche},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => nombre(v) + ' €').tickSize(-(w - gauche - droite)));
      styleAxe(gy); gy.select('.domain').remove(); gy.selectAll('.tick line').attr('stroke', C.grille);
      const gy2 = svg.append('g').attr('transform', `translate(${w - droite},0)`).call(d3.axisRight(y2).ticks(4).tickFormat((v) => nombre(v) + ' €').tickSize(0));
      styleAxe(gy2); gy2.select('.domain').remove();
      const pas = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor((w - gauche - droite) / 64))));
      const gx = svg.append('g').attr('transform', `translate(0,${h - bas})`).call(d3.axisBottom(x).tickValues(rows.filter((_, i) => i % pas === 0).map((r) => +r.x)).tickFormat((v) => jourCourt(new Date(v))).tickSizeOuter(0));
      styleAxe(gx);
      svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(+r.x)).attr('width', x.bandwidth()).attr('y', (r) => y(r.ca)).attr('height', (r) => h - bas - y(r.ca)).attr('rx', 4).attr('fill', C.pale);
      if (avecN1) {
        svg.append('g').selectAll('line').data(rows).join('line').attr('x1', (r) => x(+r.x) - 2).attr('x2', (r) => x(+r.x) + x.bandwidth() + 2)
          .attr('y1', (r) => y(r.n1)).attr('y2', (r) => y(r.n1)).attr('stroke', C.encre).attr('stroke-width', 2).attr('stroke-dasharray', '4 3');
      }
      const ligne = d3.line().x((r) => x(+r.x) + x.bandwidth() / 2).y((r) => y2(r.media));
      if (d3.max(rows, (r) => r.media) > 0) {
        svg.append('path').datum(rows).attr('d', ligne).attr('fill', 'none').attr('stroke', C.bordeaux).attr('stroke-width', 2.2).attr('stroke-linejoin', 'round');
        svg.append('g').selectAll('circle').data(rows).join('circle').attr('cx', (r) => x(+r.x) + x.bandwidth() / 2).attr('cy', (r) => y2(r.media)).attr('r', 3).attr('fill', C.bordeaux);
      }
      const bl = bulle(el);
      svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(+r.x) - x.step() * x.padding() / 2).attr('width', x.step()).attr('y', top).attr('height', h - bas - top).attr('fill', 'transparent')
        .on('mousemove', (ev, r) => { const [, my] = d3.pointer(ev); bl.montrer((x(+r.x) + x.bandwidth()) * (el.clientWidth / w), my, 'Semaine du ' + jourCourt(r.x), [[C.pale, 'CA HT', nombre(r.ca) + ' €'], ...(avecN1 ? [[C.encre, 'CA HT 2025', nombre(r.n1) + ' €']] : []), [null, 'Passages en caisse', nombre(r.tk)], [C.bordeaux, 'Dépenses média', euros(r.media)]]); })
        .on('mouseleave', () => bl.cacher());
    }
    const el2 = document.getElementById('graph-boutique-fiche');
    const st2 = etat(['fiches_semaine']);
    if (st2 !== 'ok') echec(el2, st2);
    else {
      const rows = lignes('fiches_semaine').filter((r) => r.boutique === b);
      if (!rows.length) vide(el2, 'Fiche non reliée au suivi : pas de données pour cette boutique.');
      else {
        const r26 = rows.filter((r) => Number(r.annee) === 2026).sort((a, c) => a.semaine.localeCompare(c.semaine));
        const n1 = (s) => { const d = versDate(s); d.setUTCDate(d.getUTCDate() - 364); return d.toISOString().slice(0, 10); };
        const pts = r26.map((r) => {
          const p = rows.find((q) => q.semaine === n1(r.semaine));
          return { x: versDate(r.semaine), r: Number(r.vues_recherche), rn1: p ? Number(p.vues_recherche) : null, a: Number(r.appels) + Number(r.itineraires) + Number(r.clics_site) };
        });
        const { svg, w, h } = cadre(el2, 280);
        const top = 14; const bas = 26;
        const y = d3.scaleLinear([0, d3.max(pts, (p) => Math.max(p.r, p.rn1 || 0)) || 1], [h - bas, top]).nice(4);
        const y2 = d3.scaleLinear([0, d3.max(pts, (p) => p.a) || 1], [h - bas, top]).nice(4);
        const gauche = largeurTexte(svg, y.ticks(4).map(nombre)) + 10;
        const droite = largeurTexte(svg, y2.ticks(4).map(nombre)) + 12;
        const x = d3.scaleUtc(d3.extent(pts, (p) => p.x), [gauche, w - droite]);
        jalonsDe('fiche').forEach((j) => { const a = lundi(j.debut); const b = d3.utcDay.offset(a, 7); svg.append('rect').attr('x', x(a)).attr('width', x(b) - x(a)).attr('y', top).attr('height', h - bas - top).attr('fill', 'rgba(226,128,107,0.18)'); });
        const gy = svg.append('g').attr('transform', `translate(${gauche},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(nombre).tickSize(-(w - gauche - droite)));
        styleAxe(gy); gy.select('.domain').remove(); gy.selectAll('.tick line').attr('stroke', C.grille);
        const gy2 = svg.append('g').attr('transform', `translate(${w - droite},0)`).call(d3.axisRight(y2).ticks(4).tickFormat(nombre).tickSize(0));
        styleAxe(gy2); gy2.select('.domain').remove();
        const gx = svg.append('g').attr('transform', `translate(0,${h - bas})`).call(d3.axisBottom(x).tickValues(ticksTemps(x, w - gauche - droite, 70)).tickFormat(jourCourt).tickSizeOuter(0));
        styleAxe(gx);
        const tracer = (f, yy, couleur, pointille) => svg.append('path').datum(pts).attr('d', d3.line().defined((p) => f(p) !== null).x((p) => x(p.x)).y((p) => yy(f(p)))).attr('fill', 'none').attr('stroke', couleur).attr('stroke-width', 2.2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('stroke-dasharray', pointille ? '5 4' : null);
        tracer((p) => p.rn1, y, C.n1, true);
        tracer((p) => p.r, y, C.corail, false);
        tracer((p) => p.a, y2, C.fonce, false);
        const mk = svg.append('g');
        const bl = bulle(el2, () => mk.selectAll('*').remove());
        svg.append('rect').attr('x', gauche).attr('y', top).attr('width', w - gauche - droite).attr('height', h - bas - top).attr('fill', 'transparent')
          .on('mousemove', (ev) => {
            const [mx, my] = d3.pointer(ev);
            const i = d3.minIndex(pts, (p) => Math.abs(p.x - x.invert(mx)));
            const p = pts[i];
            mk.selectAll('*').remove();
            mk.append('line').attr('x1', x(p.x)).attr('x2', x(p.x)).attr('y1', top).attr('y2', h - bas).attr('stroke', '#d9c3b7');
            bl.montrer(x(p.x) * (el2.clientWidth / w), my, 'Semaine du ' + jourCourt(p.x), [[C.corail, 'Vues Recherche 2026', nombre(p.r)], [C.n1, 'Vues Recherche 2025', p.rn1 === null ? '—' : nombre(p.rn1)], [C.fonce, 'Actions 2026', nombre(p.a)]]);
          })
          .on('mouseleave', () => { mk.selectAll('*').remove(); bl.cacher(); });
      }
    }
  };

  /* ---------- tables ---------- */
  const tables = () => {
    const ordre = (r) => (r.groupe === 'Boutiques témoins' ? 1 : 0);
    const synth = lignes('synthese_boutiques').slice().sort((a, b) => ordre(a) - ordre(b) || String(a.boutique).localeCompare(String(b.boutique), 'fr'));
    remplirTable('table-synthese', synth, { clic: (r) => { dash.setParams({ boutique: r.boutique }); montrer('boutique'); } });
    remplirTable('table-meta', lignes('meta_campagnes').slice().sort((a, b) => String(a.boutique).localeCompare(String(b.boutique), 'fr') || String(a.levier).localeCompare(String(b.levier), 'fr')));
    remplirTable('table-google', lignes('google_campagnes'));
    remplirTable('table-fiches', lignes('fiches_periodes'), { surligner: (r) => r.boutique === 'Ensemble des fiches suivies' });
    remplirTable('table-ventes', lignes('ventes_boutiques').slice().sort((a, b) => ordre(a) - ordre(b) || String(a.boutique).localeCompare(String(b.boutique), 'fr')));
    const b = boutiqueActive();
    remplirTable('table-boutique-meta', lignes('meta_campagnes').filter((r) => (r.boutiques_couvertes || [r.boutique]).includes(b)));
    remplirTable('table-boutique-google', lignes('google_campagnes').filter((r) => r.boutique === b));
  };

  /* ---------- onglets ---------- */
  const dessiner = {
    synthese: () => { grapheChronologie(); },
    meta: graphesMeta,
    google: graphesGoogle,
    fiches: graphesFiches,
    ventes: grapheVentesIndice,
    boutique: graphesBoutique,
  };
  const interrupteur = document.getElementById('switch-reseau');
  const lien = () => (mode() === 'historiques' ? pageActive + '-historiques' : pageActive);
  const rendre = () => {
    racine.dataset.reseau = mode();
    interrupteur.setAttribute('aria-checked', String(mode() === 'historiques'));
    majMarques();
    majAlerte();
    majSelecteur();
    tables();
    dessiner[pageActive]();
  };
  const montrer = (page) => {
    if (!PAGES.includes(page)) return;
    pageActive = page;
    PAGES.forEach((p) => {
      document.getElementById(p).hidden = p !== page;
      document.getElementById('onglet-' + p).setAttribute('aria-selected', String(p === page));
    });
    dash.setLink(lien());
    rendre();
  };
  interrupteur.addEventListener('click', () => {
    dash.setParams({ reseau: autreMode(), boutique: null });
    dash.setLink(lien());
  });
  racine.querySelectorAll('.bh-onglet').forEach((b) => b.addEventListener('click', () => montrer(b.dataset.page)));

  /* Lien retour vers le portail, seulement quand le bilan est servi depuis le portail (dossier bilan/). */
  if (/\/bilan\/(index\.html)?$/.test(location.pathname)) racine.querySelectorAll('.bh-retour').forEach((l) => { l.hidden = false; });
  preparerTris();
  const [demande, reseau] = location.hash.slice(1).split('-');
  if (reseau === 'historiques') dash.setParams({ reseau: 'historiques' });
  dash.onData(rendre);
  if (PAGES.includes(demande)) montrer(demande);
})();
