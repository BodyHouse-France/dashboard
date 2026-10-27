"""Construit le bilan des boutiques Body House (bilan/index.html) à partir des données collectées.

Entrées (dossier _bilan/collecte/) :
  followup.txt          export du follow-up (Doc « Bilan boutiques - export hebdo » écrit par l'Apps Script)
  meta_campagnes.csv    totaux par campagne Meta (meta_csv.py)
  meta_jour.csv         dépenses Meta par jour : comptes entiers + campagnes exclues (meta_csv.py)
  google_campagnes.csv  totaux par campagne Google Ads (google_csv.py)
  collecte.json         dates de collecte de chaque source
Paramètres : _bilan/config.json. Fin de période : dernier dimanche écoulé (ou --fin AAAA-MM-JJ).

Usage : python3 _bilan/scripts/construire.py [--fin AAAA-MM-JJ] [--sortie chemin.html] [--donnees dossier]
Code de sortie 1 si une erreur bloque la construction ; les alertes sont affichées sans bloquer.
"""
import argparse, csv, json, math, os, re, statistics, sys, unicodedata
from datetime import date, datetime, timedelta

ICI = os.path.dirname(os.path.abspath(__file__))
BILAN = os.path.dirname(ICI)
RACINE = os.path.dirname(BILAN)
COLLECTE = os.path.join(BILAN, 'collecte')

ERREURS, ALERTES = [], []


def erreur(msg):
    ERREURS.append(msg)


def alerte(msg):
    ALERTES.append(msg)


# ------------------------------------------------------------------ outils
def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().upper()
    return ' '.join(re.sub(r'[^A-Z0-9]+', ' ', s).split())


def contient(nom, alias):
    return f' {alias} ' in f' {nom} '


def associer(nom, candidats):
    """candidats : [(alias normalisé, valeur)]. Renvoie la valeur de l'alias le plus long contenu dans le nom."""
    n = norm(nom)
    trouves = [(len(a), v) for a, v in candidats if a and contient(n, a)]
    return max(trouves, key=lambda t: t[0])[1] if trouves else None


def j(s):
    return date.fromisoformat(str(s)[:10])


def lundi(d):
    return d - timedelta(days=d.weekday())


def semaines_entre(d0, d1):
    out, d = [], lundi(d0)
    while d <= d1:
        out.append(d)
        d += timedelta(days=7)
    return out


def num(x, defaut=0.0):
    if x is None:
        return defaut
    s = str(x).strip().replace(' ', '').replace(' ', '')
    if s == '' or s.lower() in ('none', 'null', 'nan', '-', '--'):
        return defaut
    s = s.replace(',', '.').replace('%', '')
    try:
        return float(s)
    except ValueError:
        return defaut


def div(a, b, nd=None):
    if not b:
        return None
    v = a / b
    return round(v, nd) if nd is not None else v


MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']


def jour_txt(d):
    return '1er' if d.day == 1 else str(d.day)


def date_longue(d):
    return f'{jour_txt(d)} {MOIS_LONG[d.month - 1]} {d.year}'


def date_courte(d):
    return f'{jour_txt(d)} {MOIS_COURT[d.month - 1]}'


# ------------------------------------------------------------------ export du follow-up
def lire_export(chemin):
    brut = open(chemin, encoding='utf-8').read()
    brut = re.sub(r'\\([\\`*_{}\[\]()#+\-.!|~>&<=])', r'\1', brut)  # échappements Markdown ajoutés par le connecteur Drive
    lignes = [l.strip() for l in re.split(r'[\r\n\v\f  ]+', brut) if l.strip()]
    debut = next((i for i, l in enumerate(lignes) if l.startswith('EXPORT;')), None)
    if debut is None:
        erreur('followup.txt : ligne « EXPORT; » introuvable (le Doc exporté est-il le bon ?)')
        return None
    lignes = lignes[debut:]
    fin = next((i for i, l in enumerate(lignes) if l.startswith('FIN;')), None)
    if fin is None:
        erreur('followup.txt : ligne « FIN; » absente, export tronqué')
        return None
    lignes = lignes[:fin + 1]
    attendu = int(lignes[-1].split(';')[1])
    if attendu != len(lignes):
        erreur(f'followup.txt : {len(lignes)} lignes lues pour {attendu} annoncées, export incomplet ou altéré')
    tete = lignes[0].split(';')
    ex = {'genere': tete[2] if len(tete) > 2 else '', 'ventes': {}, 'gs': {}, 'gj': {}, 'absents': []}
    for l in lignes[1:-1]:
        p = l.split(';')
        if p[0] == 'V' and len(p) >= 5 and p[4] == 'ABSENT':
            ex['absents'].append((p[1], p[2], p[3]))
            continue
        if p[0] == 'GX':
            alerte(f'Onglet {p[1]} : colonnes non reconnues par l’export ({";".join(p[2:])})')
            continue
        if p[0] not in ('V', 'GS', 'GJ'):
            alerte(f'followup.txt : ligne ignorée « {l[:60]} »')
            continue
        if p[0] == 'V':
            _, onglet, bloc, cle, premier, valeurs, total = p[:7]
        else:
            _, onglet, cle, premier, valeurs, total = p[:6]
        vals = [None if v == '' else float(v) for v in valeurs.split(',')]
        somme = sum(v for v in vals if v is not None)
        if abs(somme - float(total)) > 0.02 + 1e-6 * abs(somme):
            erreur(f'followup.txt : somme de contrôle fausse ({l[:70]}…) : {somme} pour {total}')
        d0 = j(premier)
        pas = 1 if p[0] == 'GJ' else 7
        serie = {d0 + timedelta(days=pas * i): v for i, v in enumerate(vals)}
        if p[0] == 'V':
            ex['ventes'].setdefault(onglet, {}).setdefault(bloc, {})[cle] = serie
        else:
            ex['gs' if p[0] == 'GS' else 'gj'].setdefault(onglet, {})[cle] = serie
    return ex


# ------------------------------------------------------------------ construction d'un réseau
LEVIER = {'TRAFFIC': 'Trafic', 'LINK CLICKS': 'Trafic', 'ENGAGEMENT': 'Engagement', 'POST ENGAGEMENT': 'Engagement',
          'AWARENESS': 'Notoriété', 'REACH': 'Notoriété', 'BRAND AWARENESS': 'Notoriété'}
TYPE_RESULTAT = {'reach': 'Couverture', 'page_visit_view': 'Visites de la page Facebook', 'profile_visit': 'Visites du profil'}


def construire_reseau(mode, R, cfg, ex, meta_c, meta_j, google, collecte, FIN):
    out = {}
    boutiques = R['boutiques']
    noms = [b['nom'] for b in boutiques]
    alias_b = [(norm(a), b['nom']) for b in boutiques for a in b['alias']]
    alias_meta = alias_b + [(norm(g['alias']), g['nom']) for g in R.get('regroupements_meta', [])]
    couvre = {g['nom']: g['couvre'] for g in R.get('regroupements_meta', [])}
    avec_n1 = R['reference'] == 'n1'
    debut_campagne = j(cfg['debut_campagne'])
    alertes_page = []

    # ---------------- ventes (follow-up)
    onglet = R['onglet_ventes']
    blocs = (ex or {}).get('ventes', {}).get(onglet, {})
    if ex and not blocs:
        erreur(f'{mode} : aucun bloc lu pour l’onglet « {onglet} » dans l’export')
    genere = j(ex['genere']) if ex and ex.get('genere') else None
    derniere = FIN
    if genere and genere <= FIN:
        derniere = genere - timedelta(days=1)  # export fait avant la fin de période : dernière semaine incomplète
    sem_toutes = [w for w in semaines_entre(j(cfg['ventes_debut']), derniere) if w + timedelta(days=6) <= derniere]
    ventes_rows, ventes_suivies = [], {}
    for b in boutiques:
        if not b.get('bloc_ventes'):
            ventes_suivies[b['nom']] = False
            continue
        cle_bloc = next((k for k in blocs if norm(k) == norm(b['bloc_ventes'])), None)
        if cle_bloc is None:
            cand = [k for k in blocs if any(contient(norm(k), norm(a)) for a in b['alias'])]
            cle_bloc = cand[0] if len(cand) == 1 else None
        if cle_bloc is None:
            erreur(f'{mode} : bloc « {b["bloc_ventes"]} » introuvable dans l’onglet « {onglet} »')
            ventes_suivies[b['nom']] = False
            continue
        m = blocs[cle_bloc]
        requis = ['ca', 'tk'] + (['ca1', 'tk1'] if avec_n1 else [])
        manquants = [c for c in requis if c not in m]
        if manquants:
            erreur(f'{mode} : {b["nom"]} sans ligne {", ".join(manquants)} dans le follow-up')
            ventes_suivies[b['nom']] = False
            continue
        for c in ('vis', 'meta', 'goog'):
            if c not in m:
                alerte(f'{mode} : {b["nom"]} sans ligne « {c} » dans le follow-up, comptée à 0')
        ventes_suivies[b['nom']] = True
        for w in sem_toutes:
            if m['ca'].get(w) is None:
                erreur(f'{mode} : {b["nom"]} sans CA pour la semaine du {w}')
            v = lambda c: (m.get(c) or {}).get(w) or 0
            r = {'boutique': b['nom'], 'semaine': w.isoformat(), 'groupe': b['groupe'], 'ca_ht': v('ca'), 'tickets': int(round(v('tk'))),
                 'visites_site': int(round(v('vis'))), 'depense_meta': v('meta'), 'depense_google': v('goog')}
            if avec_n1:
                r['ca_ht_n1'] = v('ca1')
                r['tickets_n1'] = int(round(v('tk1')))
            ventes_rows.append(r)
    out['ventes_semaine'] = ventes_rows
    pendant = [w for w in sem_toutes if w >= debut_campagne]
    if not pendant:
        erreur(f'{mode} : aucune semaine complète depuis le lancement')
    if ventes_rows:
        dern = max(r['semaine'] for r in ventes_rows if r['semaine'] >= debut_campagne.isoformat()) if pendant else None
        recentes = [r for r in ventes_rows if r['semaine'] == dern]
        if recentes and sum(r['ca_ht'] for r in recentes) == 0:
            erreur(f'{mode} : CA nul sur toute la semaine du {dern} : ventes pas encore importées dans le follow-up ?')
        media = [r for r in ventes_rows if r['semaine'] == dern]
        if media and sum(r['depense_meta'] + r['depense_google'] for r in media) == 0:
            alerte(f'{mode} : dépenses média du follow-up nulles la semaine du {dern} (Supermetrics à jour ?)')

    # ---------------- Meta : campagnes
    comptes = set(R['meta']['comptes'])
    excl = [(norm(e['motif']), e['libelle']) for e in R['meta'].get('exclusions', [])]
    meta_rows, hors = [], []
    lignes_meta = [r for r in meta_c if r['compte'] in comptes]
    if not lignes_meta:
        erreur(f'{mode} : aucune campagne Meta collectée pour les comptes {", ".join(sorted(comptes))}')
    fins_meta = {r['fin'] for r in lignes_meta}
    debuts_meta = {r['debut'] for r in lignes_meta}
    if debuts_meta and debuts_meta != {R['meta']['debut']}:
        erreur(f'{mode} : campagnes Meta collectées depuis {sorted(debuts_meta)} au lieu du {R["meta"]["debut"]}')
    meta_jusqua = min((j(f) for f in fins_meta), default=None)
    if meta_jusqua and meta_jusqua < FIN:
        alertes_page.append(f'Meta au {date_courte(meta_jusqua)}')
    comptes_vus = {r['compte'] for r in lignes_meta}
    for c in comptes - comptes_vus:
        alerte(f'{mode} : aucun résultat Meta pour le compte {c} (compte sans dépense ou non collecté ?)')
    non_affectees = 0.0
    for r in lignes_meta:
        sp, im = num(r['depense']), num(r['impressions'])
        if sp <= 0 and im <= 0:
            continue
        nom = r['campagne']
        ex_lib = next((lib for motif, lib in excl if contient(norm(nom), motif)), None)
        ig = int(num(r['abonnes_instagram']))
        if ex_lib:
            hors.append({'campagne': nom, 'libelle': ex_lib, 'depense': sp, 'abonnes_instagram': ig})
            continue
        boutique = associer(nom, alias_meta)
        if boutique is None:
            alerte(f'{mode} : campagne Meta non rattachée à une boutique, comptée hors périmètre : {nom} ({sp:.2f} €)')
            hors.append({'campagne': nom, 'libelle': 'Campagne non rattachée', 'depense': sp, 'abonnes_instagram': ig})
            non_affectees += sp
            continue
        obj = norm(re.sub(r'^OUTCOME_', '', str(r['objectif']).upper()))
        levier = LEVIER.get(obj)
        if levier is None:
            alerte(f'{mode} : objectif Meta inconnu « {r["objectif"]} » ({nom}), campagne ignorée')
            continue
        re_, cl, lc = num(r['couverture']), int(num(r['clics'])), int(num(r['clics_lien']))
        rx, co, sv, lk = int(num(r['reactions'])), int(num(r['commentaires'])), int(num(r['enregistrements'])), int(num(r['abonnes_facebook']))
        ind = re.sub(r'^actions:', '', str(r['indicateur']).strip())
        res = num(r['resultat'], None)
        if levier == 'Engagement':
            resultat = res if ind == 'post_interaction_gross' and res is not None else rx + co + sv
            type_res = 'Interactions avec les publications'
        else:
            resultat = res if res is not None else (re_ if levier == 'Notoriété' else lc)
            type_res = TYPE_RESULTAT.get(ind, 'Couverture' if levier == 'Notoriété' else 'Visites')
            if res is None:
                alerte(f'{mode} : résultat Meta absent pour {nom}, remplacé par {"la couverture" if levier == "Notoriété" else "les clics sur lien"}')
        resultat = int(round(resultat))
        interactions = resultat if levier == 'Engagement' else rx + co + sv
        diffusion = 'Instagram' if '_IG_' in nom.upper() else 'Facebook' if '_FB_' in nom.upper() else 'Facebook + Instagram'
        meta_rows.append({
            'boutique': boutique, 'levier': levier, 'diffusion': diffusion, 'campagne': nom,
            'boutiques_couvertes': couvre.get(boutique, [boutique]),
            'depense': round(sp, 2), 'impressions': int(im), 'couverture': int(re_), 'repetition': div(im, re_, 2), 'cpm': div(sp * 1000, im, 2),
            'clics': cl, 'clics_lien': lc, 'interactions': interactions, 'reactions': rx, 'commentaires': co, 'enregistrements': sv,
            'abonnes_facebook': lk, 'abonnes_instagram': ig, 'abonnes': lk + ig, 'visites_page_facebook': resultat if levier == 'Trafic' else 0,
            'resultat': resultat, 'type_resultat': type_res, 'cout_par_resultat': div(sp, resultat, 4),
        })
    out['meta_campagnes'] = meta_rows
    regroupes = {}
    for h in hors:  # une ligne par libellé (ex. plusieurs campagnes nationales)
        g = regroupes.setdefault(h['libelle'], {'campagne': [], 'libelle': h['libelle'], 'depense': 0.0, 'abonnes_instagram': 0})
        g['campagne'].append(h['campagne'])
        g['depense'] = round(g['depense'] + h['depense'], 2)
        g['abonnes_instagram'] += h['abonnes_instagram']
    out['hors_perimetre'] = [dict(g, campagne=' + '.join(g['campagne'])) for g in regroupes.values()]

    # ---------------- Meta : par jour
    d0 = j(cfg['meta_jour_debut'])
    fin_jour = min(FIN, meta_jusqua) if meta_jusqua else FIN
    jours = [d0 + timedelta(days=i) for i in range((fin_jour - d0).days + 1)]
    tot = {d: [0.0] * 5 for d in jours}
    vus = {c: set() for c in comptes}
    CH = ['depense', 'impressions', 'clics_lien', 'interactions_pub', 'abonnes_facebook']
    for r in meta_j:
        if r['compte'] not in comptes:
            continue
        d = j(r['jour'])
        if d not in tot:
            continue
        if r['portee'] == 'compte':
            vus[r['compte']].add(d)
            signe = 1
        elif any(contient(norm(r['campagne']), m) for m, _ in excl):
            signe = -1
        else:
            continue
        for k, c in enumerate(CH):
            tot[d][k] += signe * num(r[c])
    for c, js in vus.items():
        if c in comptes_vus and len(js) != len(jours):
            alerte(f'{mode} : {len(jours) - len(js)} jour(s) manquant(s) dans les dépenses Meta par jour du compte {c}')
    out['meta_jour'] = [{'jour': d.isoformat(), 'depense': round(v[0], 2), 'impressions': int(round(v[1])), 'clics_lien': int(round(v[2])),
                         'interactions_publication': int(round(v[3])), 'abonnes_facebook': int(round(v[4]))} for d, v in tot.items()]
    s_jour = sum(r['depense'] for r in out['meta_jour'])
    s_camp = sum(r['depense'] for r in meta_rows) + non_affectees
    if s_camp and abs(s_jour - s_camp) / s_camp > 0.01:
        alerte(f'{mode} : dépense Meta par jour {s_jour:.2f} € contre {s_camp:.2f} € par campagne (écart {100 * (s_jour / s_camp - 1):+.1f} %)')

    # ---------------- Google Ads
    g_rows = [r for r in google if r['reseau'] == mode]
    if not g_rows:
        alerte(f'{mode} : aucune campagne Google Ads collectée')
    gfins = {r['fin'] for r in g_rows}
    g_jusqua = min((j(f) for f in gfins), default=None)
    if g_jusqua and g_jusqua < FIN:
        alertes_page.append(f'Google Ads au {date_courte(g_jusqua)}')
    gdebuts = {r['debut'] for r in g_rows}
    if gdebuts and gdebuts != {R['google']['debut']}:
        erreur(f'{mode} : campagnes Google collectées depuis {sorted(gdebuts)} au lieu du {R["google"]["debut"]}')
    appels = R['google'].get('appels_suivis', True)
    lanc = {b['nom']: b.get('lancement_google', '') for b in boutiques}
    google_rows = []
    for r in g_rows:
        c, im, cl = num(r['depense']), int(num(r['impressions'])), int(num(r['clics']))
        if c <= 0 and im <= 0:
            continue
        morceaux = [m.strip() for m in r['campagne'].split('|')]
        boutique = associer(morceaux[2], alias_b) if len(morceaux) >= 3 else None
        boutique = boutique or associer(r['campagne'], alias_b)
        if boutique is None:
            alerte(f'{mode} : campagne Google non rattachée à une boutique, ignorée : {r["campagne"]} ({c:.2f} €)')
            continue
        di = int(num(r['itineraires']))
        isr = num(r['part_impressions'], None)
        google_rows.append({'boutique': boutique, 'campagne': r['campagne'], 'lancement': lanc.get(boutique, ''),
                            'depense': round(c, 2), 'impressions': im, 'clics': cl, 'ctr': div(cl, im, 4), 'cpc_moyen': div(c, cl, 2),
                            'itineraires': di, 'appels': int(num(r['appels'])) if appels else None,
                            'visites_site': int(num(r['visites_site'])) if appels else None,
                            'autres_engagements': int(num(r['autres_engagements'])),
                            'part_impressions': round(isr, 4) if isr is not None else None, 'cout_par_itineraire': div(c, di, 2)})
    out['google_campagnes'] = google_rows

    # ---------------- fiches Google
    gs, gj = (ex or {}).get('gs', {}), (ex or {}).get('gj', {})
    fiches = [(b['nom'], b['onglet_fiche']) for b in boutiques if b.get('onglet_fiche')]
    suivies = {}
    for nom, ong in fiches:
        ok = ong in gs and all(k in gs[ong] for k in ('search', 'maps', 'calls', 'dir', 'web')) and ong in gj
        if not ok:
            alerte(f'{mode} : fiche « {ong} » absente ou incomplète dans l’export, non comptée')
        suivies[nom] = ok
    actives = [(n, o) for n, o in fiches if suivies[n]]
    jdeb = j(cfg['fiches']['jours_debut'])
    # dernier jour consolidé : vues Recherche ET Maps présentes, à au moins 30 % de la médiane des 14 jours précédents
    totaux = {'search': {}, 'maps': {}}
    for _, o in actives:
        for k in ('search', 'maps'):
            for d, v in gj[o][k].items():
                if d >= jdeb - timedelta(days=21) and d <= FIN and v is not None:
                    totaux[k][d] = totaux[k].get(d, 0) + v

    def consolide(k, d):
        t = totaux[k]
        prec = [t[x] for x in t if d - timedelta(days=15) < x < d and t[x] > 0]
        return t.get(d, 0) > 0 and (not prec or t[d] >= 0.3 * statistics.median(prec))
    jour_ok = next((d for d in sorted(totaux['search'], reverse=True) if consolide('search', d) and consolide('maps', d)), None)
    if jour_ok is None:
        erreur(f'{mode} : aucune donnée de fiche Google exploitable')
        jour_ok = FIN
    if (FIN - jour_ok).days > 10:
        alertes_page.append(f'fiches Google au {date_courte(jour_ok)}')
    fj_rows = []
    for nom, o in actives:
        d = jdeb
        while d <= jour_ok:
            s, mp = gj[o]['search'].get(d), gj[o]['maps'].get(d)
            if s is None or mp is None:
                alerte(f'{mode} : fiche {nom} sans vues le {d}, comptées à 0')
            fj_rows.append({'boutique': nom, 'jour': d.isoformat(), 'vues_recherche': int(s or 0), 'vues_maps': int(mp or 0)})
            d += timedelta(days=1)
    out['fiches_jour'] = fj_rows
    sdeb = j(cfg['fiches']['semaines_debut'])
    s26 = [w for w in semaines_entre(sdeb, jour_ok) if w + timedelta(days=6) <= jour_ok]
    s25 = [w - timedelta(days=364) for w in s26]
    fs_rows = []
    for nom, o in actives:
        for w in s25 + s26:
            vals = {k: gs[o][k].get(w) for k in ('search', 'maps', 'calls', 'dir', 'web')}
            if any(v is None for v in vals.values()):
                alerte(f'{mode} : fiche {nom} incomplète la semaine du {w}, valeurs manquantes comptées à 0')
            fs_rows.append({'boutique': nom, 'semaine': w.isoformat(), 'annee': w.year, 'vues_recherche': int(vals['search'] or 0),
                            'vues_maps': int(vals['maps'] or 0), 'appels': int(vals['calls'] or 0), 'itineraires': int(vals['dir'] or 0),
                            'clics_site': int(vals['web'] or 0)})
    out['fiches_semaine'] = fs_rows
    apres = [w for w in s26 if w >= j(cfg['fiches']['apres_debut'])]
    if not apres:
        erreur(f'{mode} : aucune semaine de fiches consolidée après le {cfg["fiches"]["apres_debut"]}')

    # ---------------- référentiel, jalons, paramètres, période
    out['boutiques'] = [{'boutique': b['nom'], 'groupe': b['groupe'], 'page_facebook': b.get('page_facebook', ''),
                         'lancement_meta': b.get('lancement_meta', ''), 'lancement_notoriete': b.get('lancement_notoriete', ''),
                         'lancement_google': b.get('lancement_google', ''), 'fiche_google_suivie': 'oui' if suivies.get(b['nom']) else 'non',
                         'ventes_suivies': 'oui' if ventes_suivies.get(b['nom']) else 'non', 'note': b.get('note', '')} for b in boutiques]
    jal = [dict(x) for x in R.get('jalons', [])]
    pauses = [(j(x['debut']), j(x['fin'])) for x in jal if x['type'] == 'pause']
    run = []
    for r in out['meta_jour'] + [{'jour': (fin_jour + timedelta(days=1)).isoformat(), 'depense': 1}]:
        if r['depense'] <= 0:
            run.append(j(r['jour']))
            continue
        if len(run) >= 2 and not any(a <= run[-1] and run[0] <= b for a, b in pauses):
            jal.append({'debut': run[0].isoformat(), 'fin': run[-1].isoformat(), 'type': 'pause',
                        'libelle': f'Diffusion Meta interrompue {len(run)} jours (aucune dépense)'})
        run = []
    jal.sort(key=lambda x: x['debut'])
    out['jalons'] = jal
    fav = cfg['fiches']['avant']
    out['parametres'] = [{'mode': mode, 'reference': R['reference'], 'pendant': [w.isoformat() for w in pendant], 'avant': cfg['avant'],
                          'fiches_avant': fav, 'fiches_apres': [w.isoformat() for w in apres],
                          'fiches_apres_n1': [(w - timedelta(days=364)).isoformat() for w in apres]}]
    if genere and genere <= FIN and sem_toutes:
        alertes_page.append(f'ventes au {date_courte(sem_toutes[-1] + timedelta(days=6))}')
    out['periode'] = [{
        'fin': FIN.isoformat(), 'libelle_maj': date_longue(FIN),
        'libelle_media': f'{date_courte(d0)} → {date_courte(FIN)} {FIN.year}',
        'libelle_ventes': f'{date_courte(pendant[0])} → {date_courte(pendant[-1] + timedelta(days=6))}' if pendant else '—',
        'nb_semaines': len(pendant),
        'libelle_fiches_apres': f'{date_courte(apres[0])} → {date_courte(apres[-1] + timedelta(days=6))}' if apres else '—',
        'fiches_jusqua': jour_ok.isoformat(),
        'alerte': f'Sources en retard sur le {date_courte(FIN)} : ' + ', '.join(alertes_page) if alertes_page else '',
    }]
    for a in alertes_page:
        alerte(f'{mode} : {a}')

    # ---------------- résumé (contrôle de cohérence d'une semaine sur l'autre)
    resume = {'depense_meta': round(sum(r['depense'] for r in meta_rows), 2), 'impressions_meta': sum(r['impressions'] for r in meta_rows),
              'depense_google': round(sum(r['depense'] for r in google_rows), 2), 'itineraires_google': sum(r['itineraires'] for r in google_rows),
              'nb_campagnes_meta': len(meta_rows), 'nb_campagnes_google': len(google_rows), 'nb_semaines': len(pendant),
              'ca_periode': round(sum(r['ca_ht'] for r in ventes_rows if r['semaine'] >= debut_campagne.isoformat()), 2),
              'meta_jusqua': meta_jusqua.isoformat() if meta_jusqua else None, 'google_jusqua': g_jusqua.isoformat() if g_jusqua else None,
              'fiches_jusqua': jour_ok.isoformat()}
    return out, resume


def verifier_valeurs(mode, out):
    for nom, rows in out.items():
        for r in rows:
            for k, v in r.items():
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    erreur(f'{mode} : valeur non numérique {k}={v} dans {nom}')


def comparer(precedent, nouveau, FIN):
    for mode, n in nouveau.items():
        p = (precedent or {}).get('reseaux', {}).get(mode)
        if not p:
            continue
        for k in ('depense_meta', 'impressions_meta', 'depense_google', 'itineraires_google', 'ca_periode'):
            a, b = p.get(k) or 0, n.get(k) or 0
            if a and b < a * 0.98:
                alerte(f'{mode} : {k} baisse de {a} à {b} depuis la construction du {precedent.get("fin")} (cumul attendu en hausse)')


def assembler(datasets, sortie):
    page = open(os.path.join(BILAN, 'page', 'index.html'), encoding='utf-8').read()
    page = re.sub(r'<link rel="stylesheet" href="[^"]+">\s*', '', page)
    page = re.sub(r'<script src="[^"]+"></script>\s*', '', page)
    shim = """
window.dash = (() => {
  const DATA = %s;
  const calcs = {};
  const cache = {};
  const rappels = [];
  const DEFAUTS = { reseau: 'nouvelles', boutique: null };
  let params = { ...DEFAUTS };
  const mode = () => (DATA[params.reseau] ? params.reseau : 'nouvelles');
  const resoudre = (id) => {
    const m = mode();
    if (DATA[m][id]) return DATA[m][id];
    const cle = m + ':' + id;
    if (cache[cle]) return cache[cle];
    const c = calcs[id];
    if (!c) return null;
    cache[cle] = c.fn(...c.inputs.map(resoudre));
    return cache[cle];
  };
  const relancer = () => rappels.forEach((f) => f());
  let t = null;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(relancer, 120); });
  return {
    calc(id, def) { calcs[id] = def; },
    data(id) { const d = resoudre(id); return d ? { status: 'ok', data: d, columns: d.length ? Object.keys(d[0]) : [] } : { status: 'missing', data: [] }; },
    onData(fn) { rappels.push(fn); fn(); },
    params() { return params; },
    setParams(p) { params = { ...params, ...p }; relancer(); },
    resetParams() { params = { ...DEFAUTS }; relancer(); },
    setLink(nom) { try { history.replaceState(null, '', '#' + nom); } catch (e) { /* aperçu sans historique */ } },
    refresh() {},
    colors: ['#a64551', '#e2806b', '#7f2f3b', '#c9a89a'],
  };
})();
""" % json.dumps(datasets, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    racine = """
:root { --cds-radius: 14px; --cds-dur-slow: 0.3s; --cds-ease-out: cubic-bezier(.2,.8,.2,1);
  --font-anthropic-sans: system-ui, -apple-system, 'Segoe UI', sans-serif; --color-bad: #b3261e; }
html, body { margin: 0; padding: 0; background: #efe3dc; }
body { padding: clamp(0px, 2vw, 24px); }
#dash-root { max-width: 1320px; margin: 0 auto; }
.dash-skeleton { color: transparent !important; background: #f1e4dc; border-radius: 6px; }
@media print { body { background: #fff; padding: 0; } .bh-onglets { display: none; } .bh-page[hidden] { display: block !important; } }
"""
    lire = lambda *p: open(os.path.join(BILAN, *p), encoding='utf-8').read()
    html = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Bilan boutiques Body House</title>
<style>{racine}</style>
<style>{lire('page', 'brand.css')}</style>
<style>{lire('page', 'style.css')}</style>
</head>
<body>
<div id="dash-root">
{page}
</div>
<script>{lire('vendor', 'd3.min.js')}</script>
<script>{shim}</script>
<script>{lire('page', 'calcs.js')}</script>
<script>{lire('page', 'app.js')}</script>
</body>
</html>
"""
    os.makedirs(os.path.dirname(sortie), exist_ok=True)
    open(sortie, 'w', encoding='utf-8').write(html)
    return len(html)


def lire_csv(nom):
    chemin = os.path.join(COLLECTE, nom)
    if not os.path.exists(chemin):
        erreur(f'{nom} absent de _bilan/collecte/')
        return []
    return list(csv.DictReader(open(chemin, encoding='utf-8')))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fin', help='fin de période AAAA-MM-JJ (défaut : dernier dimanche écoulé)')
    ap.add_argument('--sortie', default=os.path.join(RACINE, 'bilan', 'index.html'))
    ap.add_argument('--donnees', help='dossier où écrire aussi les jeux de données JSON (contrôle)')
    ap.add_argument('--sans-resume', action='store_true', help='ne pas mettre à jour _bilan/resume.json')
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(BILAN, 'config.json'), encoding='utf-8'))
    aujourdhui = date.today()
    FIN = j(a.fin) if a.fin else aujourdhui - timedelta(days=aujourdhui.weekday() + 1)
    collecte = json.load(open(os.path.join(COLLECTE, 'collecte.json'), encoding='utf-8')) if os.path.exists(os.path.join(COLLECTE, 'collecte.json')) else {}
    ex = lire_export(os.path.join(COLLECTE, 'followup.txt')) if os.path.exists(os.path.join(COLLECTE, 'followup.txt')) else None
    if ex is None and not ERREURS:
        erreur('followup.txt absent de _bilan/collecte/')
    meta_c, meta_j, google = lire_csv('meta_campagnes.csv'), lire_csv('meta_jour.csv'), lire_csv('google_campagnes.csv')
    datasets, resumes = {}, {}
    if ex is not None:
        for mode, R in cfg['reseaux'].items():
            datasets[mode], resumes[mode] = construire_reseau(mode, R, cfg, ex, meta_c, meta_j, google, collecte, FIN)
            verifier_valeurs(mode, datasets[mode])
        if set(datasets['nouvelles']) != set(datasets['historiques']):
            erreur('jeux de données différents entre les deux réseaux')
    chemin_resume = os.path.join(BILAN, 'resume.json')
    precedent = json.load(open(chemin_resume, encoding='utf-8')) if os.path.exists(chemin_resume) else None
    if resumes:
        comparer(precedent, resumes, FIN)
    print(f'Fin de période : {FIN} ({date_longue(FIN)})')
    for mode, r in resumes.items():
        print(f'  {mode:11s} Meta {r["depense_meta"]:>10.2f} € ({r["nb_campagnes_meta"]} campagnes, au {r["meta_jusqua"]}) · '
              f'Google {r["depense_google"]:>9.2f} € ({r["nb_campagnes_google"]} campagnes, au {r["google_jusqua"]}) · '
              f'{r["nb_semaines"]} semaines de ventes, CA {r["ca_periode"]:.0f} € · fiches au {r["fiches_jusqua"]}')
    for m in ALERTES:
        print('ALERTE  ' + m)
    if ERREURS:
        for m in ERREURS:
            print('ERREUR  ' + m)
        print('Bilan NON construit.')
        sys.exit(1)
    if a.donnees:
        for mode, ds in datasets.items():
            os.makedirs(os.path.join(a.donnees, mode), exist_ok=True)
            for k, v in ds.items():
                json.dump(v, open(os.path.join(a.donnees, mode, k + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    taille = assembler(datasets, a.sortie)
    if not a.sans_resume:
        json.dump({'fin': FIN.isoformat(), 'construit': datetime.now().isoformat(timespec='seconds'), 'reseaux': resumes},
                  open(chemin_resume, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'Bilan écrit : {a.sortie} ({taille // 1024} Ko)')


if __name__ == '__main__':
    main()
