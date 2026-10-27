/* Calculs du bilan : chaque chiffre dérivé est calculé ici à partir des jeux de données du réseau affiché
   (nouvelles boutiques ou boutiques historiques). `parametres` (écrit à chaque mise à jour) donne les semaines
   analysées et la base de comparaison des ventes : « avant » = 7 semaines précédant la campagne,
   « n1 » = mêmes semaines de 2025. */

const TEMOINS = 'Boutiques témoins';
const param = (parametres) => (parametres && parametres[0]) || {};
const reference = (parametres) => param(parametres).reference || 'avant';
const semaines = (parametres, cle) => param(parametres)[cle] || [];

dash.calc('kpi_global', {
  title: 'Totaux de la période',
  description: 'Somme des campagnes Meta et Google Ads affectées aux boutiques du réseau affiché.',
  inputs: ['meta_campagnes', 'google_campagnes', 'boutiques', 'hors_perimetre'],
  fn: (meta_campagnes, google_campagnes, boutiques, hors_perimetre) => {
    const somme = (rows, col) => rows.reduce((t, r) => t + Number(r[col]), 0);
    const engagement = meta_campagnes.filter((r) => r.levier === 'Engagement');
    const trafic = meta_campagnes.filter((r) => r.levier === 'Trafic');
    const notoriete = meta_campagnes.filter((r) => r.levier === 'Notoriété');
    const depense_meta = somme(meta_campagnes, 'depense');
    const depense_google = somme(google_campagnes, 'depense');
    return [{
      nb_boutiques_campagne: boutiques.filter((r) => r.groupe !== TEMOINS).length,
      nb_boutiques_temoins: boutiques.filter((r) => r.groupe === TEMOINS).length,
      nb_campagnes_meta: meta_campagnes.length,
      nb_campagnes_google: google_campagnes.length,
      depense_meta,
      depense_google,
      depense_totale: depense_meta + depense_google,
      depense_hors_perimetre: somme(hors_perimetre, 'depense'),
      impressions_meta: somme(meta_campagnes, 'impressions'),
      interactions: somme(meta_campagnes, 'interactions'),
      cout_interaction: somme(engagement, 'depense') / somme(engagement, 'resultat'),
      abonnes_facebook: somme(meta_campagnes, 'abonnes_facebook'),
      abonnes_instagram: somme(meta_campagnes, 'abonnes_instagram'),
      abonnes: somme(meta_campagnes, 'abonnes_facebook') + somme(meta_campagnes, 'abonnes_instagram'),
      abonnes_instagram_hors_perimetre: somme(hors_perimetre, 'abonnes_instagram'),
      visites_page_facebook: somme(trafic, 'resultat'),
      cout_visite_page: somme(trafic, 'depense') / somme(trafic, 'resultat'),
      couverture_notoriete: somme(notoriete, 'couverture'),
      cpm_notoriete: (somme(notoriete, 'depense') / somme(notoriete, 'impressions')) * 1000,
      clics_google: somme(google_campagnes, 'clics'),
      itineraires_google: somme(google_campagnes, 'itineraires'),
      cout_itineraire: depense_google / somme(google_campagnes, 'itineraires'),
      cpc_google: depense_google / somme(google_campagnes, 'clics'),
    }];
  },
});

dash.calc('meta_diffusion', {
  title: 'Jours de diffusion Meta',
  description: 'Jours avec et sans dépense Meta depuis le 7 sept. 2026.',
  inputs: ['meta_jour'],
  fn: (meta_jour) => {
    const sans = meta_jour.filter((r) => Number(r.depense) === 0).length;
    return [{ jours_total: meta_jour.length, jours_sans_diffusion: sans, jours_diffusion: meta_jour.length - sans, part_sans_diffusion: sans / meta_jour.length }];
  },
});

dash.calc('meta_leviers', {
  title: 'Meta par levier',
  description: 'Campagnes Meta regroupées par objectif (Notoriété, Trafic, Engagement), toutes boutiques.',
  inputs: ['meta_campagnes'],
  fn: (meta_campagnes) => ['Notoriété', 'Trafic', 'Engagement'].map((levier) => {
    const rows = meta_campagnes.filter((r) => r.levier === levier);
    const somme = (col) => rows.reduce((t, r) => t + Number(r[col]), 0);
    return {
      levier,
      nb_campagnes: rows.length,
      depense: somme('depense'),
      impressions: somme('impressions'),
      couverture: somme('couverture'),
      cpm: (somme('depense') / somme('impressions')) * 1000,
      clics_lien: somme('clics_lien'),
      interactions: somme('interactions'),
      abonnes_facebook: somme('abonnes_facebook'),
      abonnes_instagram: somme('abonnes_instagram'),
      abonnes: somme('abonnes_facebook') + somme('abonnes_instagram'),
      resultat: somme('resultat'),
      cout_par_resultat: somme('depense') / somme('resultat'),
      cout_1000_personnes: (somme('depense') / somme('couverture')) * 1000,
    };
  }),
});

dash.calc('ventes_boutiques', {
  title: 'Ventes : période analysée contre référence',
  description: 'Moyenne hebdomadaire par boutique sur les semaines de campagne (depuis le 7 sept. 2026), comparée aux 7 semaines précédentes (nouvelles boutiques) ou aux mêmes semaines de 2025 (boutiques historiques).',
  inputs: ['ventes_semaine', 'parametres'],
  fn: (ventes_semaine, parametres) => {
    const n1 = reference(parametres) === 'n1';
    const PENDANT = semaines(parametres, 'pendant');
    const AVANT = semaines(parametres, 'avant');
    const boutiques = [...new Set(ventes_semaine.map((r) => r.boutique))];
    return boutiques.map((boutique) => {
      const rows = ventes_semaine.filter((r) => r.boutique === boutique);
      const moy = (sem, col) => rows.filter((r) => sem.includes(r.semaine)).reduce((t, r) => t + Number(r[col]), 0) / sem.length;
      const ca_avant = n1 ? moy(PENDANT, 'ca_ht_n1') : moy(AVANT, 'ca_ht');
      const ca_pendant = moy(PENDANT, 'ca_ht');
      const tickets_avant = n1 ? moy(PENDANT, 'tickets_n1') : moy(AVANT, 'tickets');
      const tickets_pendant = moy(PENDANT, 'tickets');
      const visites_avant = moy(AVANT, 'visites_site');
      const visites_pendant = moy(PENDANT, 'visites_site');
      return {
        boutique,
        groupe: rows[0].groupe,
        ca_avant,
        ca_pendant,
        evol_ca: ca_pendant / ca_avant - 1,
        ca_pendant_total: ca_pendant * PENDANT.length,
        ca_avant_total: ca_avant * PENDANT.length,
        tickets_avant,
        tickets_pendant,
        evol_tickets: tickets_pendant / tickets_avant - 1,
        panier_avant: ca_avant / tickets_avant,
        panier_pendant: ca_pendant / tickets_pendant,
        visites_avant,
        visites_pendant,
        evol_visites: visites_pendant / visites_avant - 1,
        depense_media: rows.filter((r) => PENDANT.includes(r.semaine)).reduce((t, r) => t + Number(r.depense_meta) + Number(r.depense_google), 0),
        ca_ete: moy(AVANT, 'ca_ht'),
        ca_ete_n1: n1 ? moy(AVANT, 'ca_ht_n1') : null,
      };
    });
  },
});

dash.calc('ventes_groupes', {
  title: 'Ventes par groupe',
  description: 'Somme des moyennes hebdomadaires des boutiques de chaque groupe, mêmes périodes que par boutique.',
  inputs: ['ventes_boutiques'],
  fn: (ventes_boutiques) => {
    const groupes = [...new Set(ventes_boutiques.map((r) => r.groupe))].sort((a, b) => (a === TEMOINS) - (b === TEMOINS));
    return groupes.map((groupe) => {
      const rows = ventes_boutiques.filter((r) => r.groupe === groupe);
      const somme = (col) => rows.reduce((t, r) => t + Number(r[col]), 0);
      const hausse = rows.filter((r) => Number(r.evol_ca) > 0).length;
      return {
        groupe,
        nb_boutiques: rows.length,
        nb_boutiques_hausse: hausse,
        nb_boutiques_baisse: rows.length - hausse,
        ca_avant: somme('ca_avant'),
        ca_pendant: somme('ca_pendant'),
        ca_pendant_total: somme('ca_pendant_total'),
        ca_avant_total: somme('ca_avant_total'),
        evol_ca: somme('ca_pendant') / somme('ca_avant') - 1,
        tickets_avant: somme('tickets_avant'),
        tickets_pendant: somme('tickets_pendant'),
        evol_tickets: somme('tickets_pendant') / somme('tickets_avant') - 1,
        panier_avant: somme('ca_avant') / somme('tickets_avant'),
        panier_pendant: somme('ca_pendant') / somme('tickets_pendant'),
        evol_visites: somme('visites_pendant') / somme('visites_avant') - 1,
        part_media_ca: somme('depense_media') / somme('ca_pendant_total'),
        evol_ca_ete: rows.every((r) => r.ca_ete_n1 !== null) ? somme('ca_ete') / somme('ca_ete_n1') - 1 : null,
      };
    });
  },
});

dash.calc('ventes_reseau_semaine', {
  title: 'CA hebdomadaire du réseau',
  description: 'Nouvelles boutiques : CA HT par groupe indexé sur la moyenne des 7 semaines avant campagne (base 100). Historiques : CA HT 2026 et 2025, mêmes semaines.',
  inputs: ['ventes_semaine', 'parametres'],
  fn: (ventes_semaine, parametres) => {
    const liste = [...new Set(ventes_semaine.map((r) => r.semaine))].sort();
    const AVANT = semaines(parametres, 'avant');
    const out = [];
    if (reference(parametres) === 'n1') {
      for (const semaine of liste) {
        const rows = ventes_semaine.filter((r) => r.semaine === semaine);
        const ca = rows.reduce((t, r) => t + Number(r.ca_ht), 0);
        const ca_n1 = rows.reduce((t, r) => t + Number(r.ca_ht_n1), 0);
        out.push({ groupe: rows[0].groupe, semaine, ca_ht: ca, ca_ht_n1: ca_n1, indice: (ca / ca_n1) * 100 });
      }
      return out;
    }
    for (const groupe of ['Boutiques en campagne', TEMOINS]) {
      const ca = (s) => ventes_semaine.filter((r) => r.groupe === groupe && r.semaine === s).reduce((t, r) => t + Number(r.ca_ht), 0);
      const base = AVANT.reduce((t, s) => t + ca(s), 0) / AVANT.length;
      for (const semaine of liste) out.push({ groupe, semaine, ca_ht: ca(semaine), indice: (ca(semaine) / base) * 100 });
    }
    return out;
  },
});

dash.calc('synthese_boutiques', {
  title: 'Synthèse par boutique',
  description: 'Dépenses, résultats Meta et Google Ads et évolution des ventes, par boutique.',
  inputs: ['boutiques', 'meta_campagnes', 'google_campagnes', 'ventes_boutiques'],
  fn: (boutiques, meta_campagnes, google_campagnes, ventes_boutiques) => boutiques.map((b) => {
    const v = ventes_boutiques.find((r) => r.boutique === b.boutique) || {};
    const meta = meta_campagnes.filter((r) => r.boutique === b.boutique);
    const engagement = meta.filter((r) => r.levier === 'Engagement');
    const trafic = meta.filter((r) => r.levier === 'Trafic');
    const google = google_campagnes.filter((r) => r.boutique === b.boutique);
    const somme = (rows, col) => rows.reduce((t, r) => t + Number(r[col]), 0);
    const depense_meta = somme(meta, 'depense');
    const depense_google = somme(google, 'depense');
    const en_campagne = meta.length + google.length > 0;
    const ventes = v.ca_pendant_total !== undefined;
    return {
      boutique: b.boutique,
      groupe: b.groupe,
      depense_meta: meta.length ? depense_meta : null,
      depense_google: google.length ? depense_google : null,
      depense_totale: en_campagne ? depense_meta + depense_google : null,
      interactions: meta.length ? somme(meta, 'interactions') : null,
      cout_interaction: engagement.length ? somme(engagement, 'depense') / somme(engagement, 'resultat') : null,
      abonnes_facebook: meta.length ? somme(meta, 'abonnes_facebook') : null,
      abonnes_instagram: meta.length ? somme(meta, 'abonnes_instagram') : null,
      abonnes: meta.length ? somme(meta, 'abonnes_facebook') + somme(meta, 'abonnes_instagram') : null,
      visites_page_facebook: trafic.length ? somme(trafic, 'resultat') : null,
      itineraires_google: google.length ? somme(google, 'itineraires') : null,
      cout_itineraire: google.length ? depense_google / somme(google, 'itineraires') : null,
      ca_pendant_total: ventes ? v.ca_pendant_total : null,
      ca_avant_total: ventes ? v.ca_avant_total : null,
      evol_ca: ventes ? v.evol_ca : null,
      evol_tickets: ventes ? v.evol_tickets : null,
      evol_visites: ventes ? v.evol_visites : null,
      part_media_ca: en_campagne && ventes ? (depense_meta + depense_google) / v.ca_pendant_total : null,
    };
  }),
});

dash.calc('fiches_periodes', {
  title: 'Fiches Google avant / après',
  description: 'Moyennes hebdo : avant = 24 août → 20 sept. 2026, après = depuis le 28 sept. 2026 (semaines consolidées), N-1 = mêmes semaines de 2025. Actions = appels + itinéraires + clics vers le site.',
  inputs: ['fiches_semaine', 'parametres'],
  fn: (fiches_semaine, parametres) => {
    const AV = semaines(parametres, 'fiches_avant');
    const APRES = semaines(parametres, 'fiches_apres');
    const APRES_N1 = semaines(parametres, 'fiches_apres_n1');
    const ligne = (boutique, rows) => {
      const moy = (sem, f) => rows.filter((r) => sem.includes(r.semaine)).reduce((t, r) => t + f(r), 0) / sem.length;
      const rech = (r) => Number(r.vues_recherche);
      const maps = (r) => Number(r.vues_maps);
      const actions = (r) => Number(r.appels) + Number(r.itineraires) + Number(r.clics_site);
      const o = { boutique,
        recherche_avant: moy(AV, rech), recherche_apres: moy(APRES, rech), recherche_n1: moy(APRES_N1, rech),
        maps_avant: moy(AV, maps), maps_apres: moy(APRES, maps), maps_n1: moy(APRES_N1, maps),
        actions_avant: moy(AV, actions), actions_apres: moy(APRES, actions), actions_n1: moy(APRES_N1, actions),
        itineraires_avant: moy(AV, (r) => Number(r.itineraires)), itineraires_apres: moy(APRES, (r) => Number(r.itineraires)),
        itineraires_n1: moy(APRES_N1, (r) => Number(r.itineraires)),
        appels_avant: moy(AV, (r) => Number(r.appels)), appels_apres: moy(APRES, (r) => Number(r.appels)),
        clics_site_avant: moy(AV, (r) => Number(r.clics_site)), clics_site_apres: moy(APRES, (r) => Number(r.clics_site)), clics_site_n1: moy(APRES_N1, (r) => Number(r.clics_site)) };
      o.evol_recherche = o.recherche_apres / o.recherche_avant - 1;
      o.evol_maps = o.maps_apres / o.maps_avant - 1;
      o.evol_actions = o.actions_apres / o.actions_avant - 1;
      o.evol_actions_n1 = o.actions_apres / o.actions_n1 - 1;
      o.evol_recherche_n1 = o.recherche_apres / o.recherche_n1 - 1;
      o.evol_itineraires_n1 = o.itineraires_apres / o.itineraires_n1 - 1;
      o.evol_clics_site = o.clics_site_apres / o.clics_site_avant - 1;
      o.evol_clics_site_n1 = o.clics_site_apres / o.clics_site_n1 - 1;
      return o;
    };
    const boutiques = [...new Set(fiches_semaine.map((r) => r.boutique))];
    return [ligne('Ensemble des fiches suivies', fiches_semaine), ...boutiques.map((b) => ligne(b, fiches_semaine.filter((r) => r.boutique === b)))];
  },
});

dash.calc('fiches_reseau_semaine', {
  title: 'Fiches Google par semaine',
  description: 'Somme des fiches suivies par semaine, 2026 face aux mêmes semaines de 2025 (décalage de 52 semaines).',
  inputs: ['fiches_semaine'],
  fn: (fiches_semaine) => {
    const semaines = [...new Set(fiches_semaine.filter((r) => Number(r.annee) === 2026).map((r) => r.semaine))].sort();
    const n1 = (s) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 364); return d.toISOString().slice(0, 10); };
    const somme = (s, f) => fiches_semaine.filter((r) => r.semaine === s).reduce((t, r) => t + f(r), 0);
    const actions = (r) => Number(r.appels) + Number(r.itineraires) + Number(r.clics_site);
    return semaines.map((semaine) => ({
      semaine,
      recherche: somme(semaine, (r) => Number(r.vues_recherche)), recherche_n1: somme(n1(semaine), (r) => Number(r.vues_recherche)),
      maps: somme(semaine, (r) => Number(r.vues_maps)), maps_n1: somme(n1(semaine), (r) => Number(r.vues_maps)),
      actions: somme(semaine, actions), actions_n1: somme(n1(semaine), actions),
    }));
  },
});

dash.calc('fiches_reseau_jour', {
  title: 'Fiches Google par jour',
  description: 'Vues Recherche et Maps cumulées des fiches suivies, par jour, depuis le 14 sept. 2026 (jours consolidés).',
  inputs: ['fiches_jour'],
  fn: (fiches_jour) => {
    const jours = [...new Set(fiches_jour.map((r) => r.jour))].sort();
    return jours.map((jour) => {
      const rows = fiches_jour.filter((r) => r.jour === jour);
      return { jour, vues_recherche: rows.reduce((t, r) => t + Number(r.vues_recherche), 0), vues_maps: rows.reduce((t, r) => t + Number(r.vues_maps), 0) };
    });
  },
});

dash.calc('ventes_extremes', {
  title: 'Boutiques en tête et en bas',
  description: 'Les deux plus fortes et les deux plus faibles évolutions de CA hebdomadaire (hors témoins), même comparaison que par boutique.',
  inputs: ['ventes_boutiques'],
  fn: (ventes_boutiques) => {
    const rows = ventes_boutiques.filter((r) => r.groupe !== TEMOINS && Number.isFinite(Number(r.evol_ca)))
      .sort((a, b) => Number(b.evol_ca) - Number(a.evol_ca));
    const n = rows.length;
    const pick = (i) => (i >= 0 && i < n ? rows[i] : { boutique: null, evol_ca: null });
    return [{
      haut1_nom: pick(0).boutique, evol_haut1: pick(0).evol_ca,
      haut2_nom: pick(1).boutique, evol_haut2: pick(1).evol_ca,
      bas1_nom: pick(n - 1).boutique, evol_bas1: pick(n - 1).evol_ca,
      bas2_nom: pick(n - 2).boutique, evol_bas2: pick(n - 2).evol_ca,
    }];
  },
});
