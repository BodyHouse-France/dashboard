/**
 * BODY HOUSE — Export du follow-up pour le bilan des boutiques (portail bodyhouse-france.github.io/dashboard/bilan/)
 *
 * Écrit chaque matin dans un Google Doc les données du follow-up dont le bilan a besoin :
 *   - par boutique et par semaine (lundi → dimanche) : CA HT, passages en caisse, CA et passages N-1,
 *     visites du site, dépenses Meta et Google (onglets PERFORMANCES BOUTIQUES 2026 et … BHDOR 2026) ;
 *   - par fiche Google : vues Recherche et Maps, appels, itinéraires, clics vers le site, par semaine,
 *     et vues Recherche et Maps par jour (onglets « <VILLE> GMB »).
 * Chaque lundi, la tâche planifiée Claude lit ce Doc, recalcule le bilan et le publie sur le portail.
 * Le script ne modifie rien dans le follow-up.
 *
 * MISE EN PLACE (une seule fois)
 * 1. Dans le projet Apps Script qui contient déjà l'import Lightdash : Fichiers > + > Script,
 *    nommer le fichier export_bilan_boutiques, coller ce code, enregistrer.
 * 2. Choisir la fonction exporterBilanBoutiques et cliquer sur Exécuter : autoriser l'accès
 *    (Google Docs est demandé en plus). Le journal affiche le lien du Doc créé.
 * 3. Exécuter installerDeclencheurBilan() : export chaque jour vers 8h (après l'import des ventes de 7h).
 *
 * FORMAT (une ligne par paragraphe, champs séparés par « ; ») :
 *   EXPORT;1;<date et heure>;<date du jour>
 *   V;<onglet>;<boutique>;<mesure>;<premier lundi>;<valeurs par semaine séparées par des virgules>;<total>
 *      mesures : ca, tk, ca1, tk1, vis, meta, goog (ligne « …;<mesure>;ABSENT » si introuvable)
 *   GS;<onglet GMB>;<mesure>;<premier lundi>;<valeurs par semaine>;<total>   (search, maps, calls, dir, web)
 *   GJ;<onglet GMB>;<mesure>;<premier jour>;<valeurs par jour>;<total>       (search, maps)
 *   FIN;<nombre de lignes, celle-ci comprise>
 */

const BX_CONFIG = {
  followupId: '1u4HragxQ6N1ydaOb8aWDDX2z_yzixR2OwuzhGW1WV0s', // BOUTIQUES BH_Follow-up 2026
  ongletsVentes: ['PERFORMANCES BOUTIQUES 2026', 'PERFORMANCES BOUTIQUES BHDOR 2026'],
  debutVentes: '2026-06-01',
  debutFichesSemaine: '2025-06-02',
  debutFichesJour: '2026-09-14',
  titreDoc: 'Bilan boutiques - export hebdo',
  heureDeclencheur: 8,
};

function exporterBilanBoutiques() {
  const ss = SpreadsheetApp.openById(BX_CONFIG.followupId);
  const tz = ss.getSpreadsheetTimeZone();
  const maintenant = new Date();
  const aujourdhui = Utilities.formatDate(maintenant, 'Europe/Paris', 'yyyy-MM-dd');
  const lignes = ['EXPORT;1;' + Utilities.formatDate(maintenant, 'Europe/Paris', "yyyy-MM-dd'T'HH:mm") + ';' + aujourdhui];

  BX_CONFIG.ongletsVentes.forEach(nom => bxVentes_(ss, nom, tz, aujourdhui, lignes));
  bxFiches_(ss, tz, aujourdhui, lignes);

  lignes.push('FIN;' + (lignes.length + 1));
  const doc = bxEcrireDoc_(lignes);
  Logger.log(lignes.length + ' lignes exportées dans « ' + doc.getName() + ' » : ' + doc.getUrl());
}

function installerDeclencheurBilan() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'exporterBilanBoutiques')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('exporterBilanBoutiques')
    .timeBased().everyDays(1).atHour(BX_CONFIG.heureDeclencheur).inTimezone('Europe/Paris').create();
  Logger.log('Déclencheur installé : export du bilan tous les jours vers ' + BX_CONFIG.heureDeclencheur + 'h (heure de Paris).');
}

/* ------------------------------------------------------------------ */
/* Ventes : un bloc par boutique, de la ligne « Date » à la suivante    */
/* ------------------------------------------------------------------ */

function bxVentes_(ss, nom, tz, aujourdhui, lignes) {
  const sh = ss.getSheetByName(nom);
  if (!sh) throw new Error('Onglet introuvable dans le follow-up : ' + nom);
  const v = sh.getDataRange().getValues();
  const annee = (nom.match(/20\d\d/) || [''])[0];
  const lab = i => String(v[i][0]).trim().toLowerCase();
  const debuts = [];
  for (let i = 0; i < v.length; i++) if (lab(i) === 'date') debuts.push(i);

  debuts.forEach((d, k) => {
    const fin = k + 1 < debuts.length ? debuts[k + 1] : v.length;
    let r = d + 1;
    while (r < fin && !String(v[r][0]).trim()) r++;
    if (r >= fin) return;
    const bloc = String(v[r][0]).trim().replace(/;/g, ',');

    // colonnes de dates de l'en-tête (les colonnes de totaux mensuels sont ignorées)
    const cols = [];
    for (let c = 1; c < v[d].length; c++) {
      const iso = bxDateEntete_(v[d][c], tz, annee);
      if (iso && iso >= BX_CONFIG.debutVentes && iso <= aujourdhui) cols.push([c, bxLundi_(iso)]);
    }
    const semaines = bxSemaines_(BX_CONFIG.debutVentes, aujourdhui);

    const chercher = (test, apres) => {
      for (let i = (apres === undefined ? d : apres) + 1; i < fin; i++) if (test(lab(i))) return i;
      return -1;
    };
    const estDepenses = l => l === 'dépenses' || l === 'depenses';
    const iMeta = chercher(l => l === 'meta');
    const iGoogle = chercher(l => l === 'google');
    const lignesMesures = {
      ca: chercher(l => /^ca (ht|ttc) \(boutique & cc\)$/.test(l)),
      tk: chercher(l => l === 'passage en caisse'),
      ca1: chercher(l => /^ca (ht|ttc) \(boutique & cc\) n-1$/.test(l)),
      tk1: chercher(l => l === 'passage en caisse n-1'),
      vis: chercher(l => l === 'visites'),
      meta: iMeta >= 0 ? chercher(estDepenses, iMeta) : -1,
      goog: iGoogle >= 0 ? chercher(estDepenses, iGoogle) : -1,
    };
    if (lignesMesures.meta >= 0 && iGoogle >= 0 && lignesMesures.meta > iGoogle) lignesMesures.meta = -1;

    Object.keys(lignesMesures).forEach(cle => {
      const i = lignesMesures[cle];
      if (i < 0) { lignes.push(['V', nom, bloc, cle, 'ABSENT'].join(';')); return; }
      const parSemaine = {};
      cols.forEach(([c, lundi]) => { parSemaine[lundi] = (parSemaine[lundi] || 0) + bxNombre_(v[i][c]); });
      const vals = semaines.map(s => bxArrondi_(parSemaine[s] || 0));
      lignes.push(['V', nom, bloc, cle, semaines[0], vals.join(','), bxArrondi_(vals.reduce((a, b) => a + b, 0))].join(';'));
    });
  });
}

/* ------------------------------------------------------------------ */
/* Fiches Google : onglets « <VILLE> GMB » (une ligne par jour)         */
/* ------------------------------------------------------------------ */

function bxFiches_(ss, tz, aujourdhui, lignes) {
  ss.getSheets().forEach(sh => {
    const nom = sh.getName().trim();
    if (!/ GMB$/i.test(nom) || /^PERFORMANCES/i.test(nom)) return;
    const v = sh.getDataRange().getValues();
    if (v.length < 2) return;
    const ent = v[0].map(x => String(x).trim().toLowerCase());
    const col = {
      date: ent.indexOf('date'), search: ent.indexOf('views on search'), maps: ent.indexOf('views on maps'),
      calls: ent.indexOf('phone calls'), dir: ent.indexOf('directions requests'), web: ent.indexOf('website visits'),
    };
    const manquantes = Object.keys(col).filter(k => col[k] < 0);
    if (manquantes.length) { lignes.push(['GX', nom, 'colonnes absentes ' + manquantes.join(' ')].join(';')); return; }

    const jours = {};
    let dernier = '';
    for (let i = 1; i < v.length; i++) {
      const iso = bxDateCellule_(v[i][col.date], tz);
      if (!iso || iso > aujourdhui) continue;
      jours[iso] = {};
      ['search', 'maps', 'calls', 'dir', 'web'].forEach(k => { jours[iso][k] = bxNombre_(v[i][col[k]]); });
      if (iso > dernier) dernier = iso;
    }
    if (!dernier) return;

    const semaines = bxSemaines_(BX_CONFIG.debutFichesSemaine, dernier);
    ['search', 'maps', 'calls', 'dir', 'web'].forEach(k => {
      const somme = {}, vu = {};
      Object.keys(jours).forEach(iso => {
        if (iso < BX_CONFIG.debutFichesSemaine) return;
        const l = bxLundi_(iso);
        somme[l] = (somme[l] || 0) + jours[iso][k];
        vu[l] = true;
      });
      const vals = semaines.map(s => (vu[s] ? Math.round(somme[s]) : ''));
      lignes.push(['GS', nom, k, semaines[0], vals.join(','), vals.reduce((a, b) => a + (b === '' ? 0 : b), 0)].join(';'));
    });

    const listeJours = [];
    for (let iso = BX_CONFIG.debutFichesJour; iso <= dernier; iso = bxDecaler_(iso, 1)) listeJours.push(iso);
    if (!listeJours.length) return;
    ['search', 'maps'].forEach(k => {
      const vals = listeJours.map(iso => (jours[iso] ? Math.round(jours[iso][k]) : ''));
      lignes.push(['GJ', nom, k, listeJours[0], vals.join(','), vals.reduce((a, b) => a + (b === '' ? 0 : b), 0)].join(';'));
    });
  });
}

/* ------------------------------------------------------------------ */
/* Écriture du Doc (créé au premier passage, réécrit ensuite)           */
/* ------------------------------------------------------------------ */

function bxEcrireDoc_(lignes) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BILAN_EXPORT_DOC_ID');
  let doc = null;
  if (id) { try { doc = DocumentApp.openById(id); } catch (e) { doc = null; } }
  if (!doc) {
    doc = DocumentApp.create(BX_CONFIG.titreDoc);
    props.setProperty('BILAN_EXPORT_DOC_ID', doc.getId());
  }
  const body = doc.getBody();
  body.clear();
  body.getParagraphs()[0].setText(lignes[0]);
  for (let i = 1; i < lignes.length; i++) body.appendParagraph(lignes[i]);
  doc.saveAndClose();
  return DocumentApp.openById(doc.getId());
}

/* ------------------------------------------------------------------ */
/* Outils                                                               */
/* ------------------------------------------------------------------ */

function bxDateEntete_(h, tz, annee) {
  if (h instanceof Date) return Utilities.formatDate(h, tz, 'yyyy-MM-dd');
  if (typeof h === 'number' && h > 40000 && h < 60000) {
    return Utilities.formatDate(new Date(Math.round((h - 25569) * 86400000)), 'UTC', 'yyyy-MM-dd');
  }
  const m = String(h).trim().match(/^(\d{2})[-\/](\d{2})$/);
  return m && annee ? annee + '-' + m[2] + '-' + m[1] : null;
}

function bxDateCellule_(x, tz) {
  if (x instanceof Date) return Utilities.formatDate(x, tz, 'yyyy-MM-dd');
  const s = String(x).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
}

function bxNombre_(x) {
  if (typeof x === 'number') return isFinite(x) ? x : 0;
  const s = String(x).replace(/[\s €%]/g, '').replace(',', '.');
  const n = Number(s);
  return s && isFinite(n) ? n : 0;
}

function bxArrondi_(x) {
  return Math.round(x * 100) / 100;
}

function bxLundi_(iso) {
  const p = iso.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}

function bxDecaler_(iso, jours) {
  const p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + jours)).toISOString().slice(0, 10);
}

function bxSemaines_(debut, fin) {
  const out = [];
  for (let s = bxLundi_(debut); s <= fin; s = bxDecaler_(s, 7)) out.push(s);
  return out;
}
