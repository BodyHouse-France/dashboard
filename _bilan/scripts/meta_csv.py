"""Convertit les réponses brutes du connecteur Meta Ads (ads_get_ad_entities), extraites par extraire.py,
en _bilan/collecte/meta_campagnes.csv et _bilan/collecte/meta_jour.csv.

Trois sortes d'appels sont reconnues d'après leurs paramètres :
  level=campaign, sans time_increment       -> totaux par campagne sur la période (time_range)
  level=ad_account, time_increment="1"      -> dépenses du compte entier par jour
  level=campaign, time_increment="1"        -> dépenses par jour des campagnes exclues (nationale, recrutement)
Les pages successives d'un même appel (cursor) sont mises bout à bout ; si un appel a été refait, seule la
dernière série compte. Les comptes absents des nouvelles réponses gardent leurs lignes actuelles.

Usage : python3 meta_csv.py <dossier des résultats extraits> [--remplacer-tout]
"""
import csv, glob, json, os, sys

COLLECTE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'collecte')
C_CAMP = ['compte', 'campagne', 'objectif', 'depense', 'impressions', 'couverture', 'clics', 'clics_lien', 'interactions_pub', 'reactions',
          'commentaires', 'enregistrements', 'abonnes_facebook', 'abonnes_instagram', 'resultat', 'indicateur', 'debut', 'fin']
C_JOUR = ['compte', 'portee', 'campagne', 'jour', 'depense', 'impressions', 'clics_lien', 'interactions_pub', 'abonnes_facebook']


def val(x):
    if isinstance(x, dict):
        x = x.get('value')
    if x is None or x == '':
        return 0
    try:
        f = float(x)
    except (TypeError, ValueError):
        return 0
    return int(f) if f.is_integer() else round(f, 2)


def resultat(e):
    r = e.get('results')
    if not isinstance(r, dict):
        return '', ''
    vals = r.get('values') or []
    v = vals[0].get('value') if vals and isinstance(vals[0], dict) else None
    return (val(v) if v is not None else ''), str(r.get('indicator') or '')


def charger(dossier):
    series = {}  # clé d'appel -> lignes de la dernière série
    fichiers = sorted(glob.glob(os.path.join(dossier, '*.json')))
    for f in fichiers:
        d = json.load(open(f, encoding='utf-8'))
        e = d.get('entree') or {}
        try:
            t = json.loads(d['texte'])
        except (ValueError, TypeError):
            print(f'  ignoré (réponse illisible) : {os.path.basename(f)} : {str(d.get("texte"))[:120]}')
            continue
        ents = t.get('ad_entities')
        if isinstance(ents, str):
            ents = json.loads(ents)
        if not isinstance(ents, list):
            print(f'  ignoré (pas de ad_entities) : {os.path.basename(f)}')
            continue
        niveau = 'compte' if str(e.get('level', '')).lower() in ('ad_account', 'account') else 'campagne'
        ti = str(e.get('time_increment') or '')
        tr = e.get('time_range') or ''
        tr = json.loads(tr) if isinstance(tr, str) and tr.startswith('{') else (tr or {})
        cle = (str(e.get('ad_account_id')), niveau, ti, tr.get('since'), tr.get('until'), json.dumps(e.get('filtering') or [], sort_keys=True))
        if not e.get('cursor'):
            series[cle] = {'lignes': [], 'suite': None}
        elif cle not in series:
            print(f'  page suivante sans première page, ignorée : {os.path.basename(f)}')
            continue
        series[cle]['lignes'] += ents
        series[cle]['suite'] = (t.get('pagination') or {}).get('next_cursor')
    return series


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    series = charger(sys.argv[1])
    camp, jour, comptes_camp, comptes_jour = [], [], set(), set()
    for (compte, niveau, ti, since, until, filt), s in series.items():
        if s['suite']:
            sys.exit(f'ERREUR pagination incomplète pour le compte {compte} ({niveau}, time_increment={ti or "aucun"}) : '
                     f'rappeler ads_get_ad_entities avec cursor={s["suite"]}')
        if not since or not until:
            sys.exit(f'ERREUR appel sans time_range pour le compte {compte} : refaire l’appel avec time_range')
        vus = {}
        for e in s['lignes']:
            vus[(e.get('id'), e.get('date_start'))] = e
        if niveau == 'campagne' and not ti:
            comptes_camp.add(compte)
            for e in vus.values():
                res, ind = resultat(e)
                camp.append({'compte': compte, 'campagne': e.get('name', ''), 'objectif': e.get('objective', ''),
                             'depense': val(e.get('amount_spent')), 'impressions': val(e.get('impressions')), 'couverture': val(e.get('reach')),
                             'clics': val(e.get('clicks')), 'clics_lien': val(e.get('link_click')), 'interactions_pub': val(e.get('post_engagement')),
                             'reactions': val(e.get('post_reaction')), 'commentaires': val(e.get('comment')), 'enregistrements': val(e.get('post_save')),
                             'abonnes_facebook': val(e.get('like')), 'abonnes_instagram': val(e.get('instagram_profile_follow_v2')),
                             'resultat': res, 'indicateur': ind, 'debut': since, 'fin': until})
        elif ti == '1':
            portee = 'compte' if niveau == 'compte' else 'campagne'
            comptes_jour.add((compte, portee))
            for e in vus.values():
                if not e.get('date_start'):
                    continue
                jour.append({'compte': compte, 'portee': portee, 'campagne': e.get('name', '') if portee == 'campagne' else '',
                             'jour': e['date_start'], 'depense': val(e.get('amount_spent')), 'impressions': val(e.get('impressions')),
                             'clics_lien': val(e.get('link_click')), 'interactions_pub': val(e.get('post_engagement')),
                             'abonnes_facebook': val(e.get('like'))})
        else:
            print(f'  appel non utilisé : compte {compte}, {niveau}, time_increment={ti}')
    remplacer = '--remplacer-tout' in sys.argv
    for nom, cols, lignes, garder in (('meta_campagnes.csv', C_CAMP, camp, lambda r: r['compte'] not in comptes_camp),
                                      ('meta_jour.csv', C_JOUR, jour, lambda r: (r['compte'], r['portee']) not in comptes_jour)):
        chemin = os.path.join(COLLECTE, nom)
        anciennes = [] if remplacer or not os.path.exists(chemin) else [r for r in csv.DictReader(open(chemin, encoding='utf-8')) if garder(r)]
        with open(chemin, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(anciennes + lignes)
        print(f'{nom} : {len(lignes)} lignes nouvelles, {len(anciennes)} lignes conservées d’autres comptes')
    for compte in sorted(comptes_camp):
        sp = sum(r['depense'] for r in camp if r['compte'] == compte)
        print(f'  compte {compte} : {sum(1 for r in camp if r["compte"] == compte)} campagnes, {sp:.2f} €')
    for compte, portee in sorted(comptes_jour):
        rows = [r for r in jour if r['compte'] == compte and r['portee'] == portee]
        print(f'  compte {compte} par jour ({portee}) : {len(rows)} lignes, {min(r["jour"] for r in rows) if rows else "-"} → '
              f'{max(r["jour"] for r in rows) if rows else "-"}, {sum(r["depense"] for r in rows):.2f} €')


if __name__ == '__main__':
    main()
