"""Convertit les réponses brutes du connecteur Google Ads (requêtes GAQL), extraites par extraire.py,
en _bilan/collecte/google_campagnes.csv pour un réseau.

Deux requêtes par compte (voir PROCEDURE.md), sur la même période :
  A. campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.search_impression_share
  B. campaign.name, segments.conversion_action_category, segments.conversion_action_name, metrics.all_conversions
Les noms de champs sont reconnus en snake_case comme en camelCase, réponses imbriquées ou à plat.

Usage : python3 google_csv.py <dossier des résultats extraits> --reseau nouvelles|historiques --compte ID --debut AAAA-MM-JJ --fin AAAA-MM-JJ
Les lignes des autres réseaux sont conservées ; celles du réseau indiqué sont remplacées.
"""
import argparse, csv, glob, json, os, re, sys

COLLECTE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'collecte')
COLS = ['reseau', 'compte', 'campagne', 'depense', 'impressions', 'clics', 'part_impressions', 'itineraires', 'appels', 'visites_site',
        'autres_engagements', 'debut', 'fin']


def cle(k):
    return re.sub(r'[^a-z0-9]', '', k.lower())


def aplatir(o, prefixe=''):
    out = {}
    if isinstance(o, dict):
        for k, v in o.items():
            out.update(aplatir(v, prefixe + '.' + k if prefixe else k))
    else:
        out[cle(prefixe)] = o
    return out


def lignes_de(objet):
    """Trouve la liste de lignes de résultats dans une réponse (results, rows, ou liste directe)."""
    if isinstance(objet, list):
        if objet and all(isinstance(x, dict) for x in objet):
            return objet
        return [l for x in objet for l in lignes_de(x)]
    if isinstance(objet, dict):
        for k in ('results', 'rows', 'data', 'searchResults'):
            if k in objet:
                return lignes_de(objet[k])
        if any(cle(k) in ('campaign', 'metrics', 'segments') or cle(k).startswith(('campaign', 'metrics')) for k in objet):
            return [objet]
        return [l for v in objet.values() if isinstance(v, (list, dict)) for l in lignes_de(v)]
    if isinstance(objet, str):
        try:
            return lignes_de(json.loads(objet))
        except ValueError:
            return []
    return []


def nombre(x):
    if x is None or x == '':
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).replace('%', '').replace(',', '.').replace('<', '').replace('>', '').strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def type_conversion(cat, nom):
    n, c = (nom or '').lower(), (cat or '').upper()
    if 'itin' in n or 'direction' in n or c == 'GET_DIRECTIONS':
        return 'itineraires'
    if 'appel' in n or 'call' in n or c in ('PHONE_CALL_LEAD', 'CONTACT'):
        return 'appels'
    if 'site' in n or 'website' in n:
        return 'visites_site'
    return 'autres_engagements'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dossier')
    ap.add_argument('--reseau', required=True, choices=['nouvelles', 'historiques'])
    ap.add_argument('--compte', required=True)
    ap.add_argument('--debut', required=True)
    ap.add_argument('--fin', required=True)
    a = ap.parse_args()
    camp = {}
    nb_a = nb_b = 0
    for f in sorted(glob.glob(os.path.join(a.dossier, '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        entree = json.dumps(d.get('entree') or {}).replace('-', '')
        if a.compte.replace('-', '') not in entree:
            continue
        for l in lignes_de(d.get('texte')):
            p = aplatir(l)
            nom = p.get('campaignname')
            if not nom:
                continue
            c = camp.setdefault(nom, {'depense': 0.0, 'impressions': 0.0, 'clics': 0.0, 'part_impressions': None,
                                      'itineraires': 0.0, 'appels': 0.0, 'visites_site': 0.0, 'autres_engagements': 0.0, '_a': False})
            if 'metricscostmicros' in p:
                nb_a += 1
                c['_a'] = True
                c['depense'] += nombre(p['metricscostmicros']) / 1e6
                c['impressions'] += nombre(p.get('metricsimpressions'))
                c['clics'] += nombre(p.get('metricsclicks'))
                if p.get('metricssearchimpressionshare') not in (None, ''):
                    c['part_impressions'] = nombre(p['metricssearchimpressionshare'])
                    if c['part_impressions'] > 1:
                        c['part_impressions'] /= 100
            cat = p.get('segmentsconversionactioncategory')
            nom_conv = p.get('segmentsconversionactionname')
            if cat is not None or nom_conv is not None:
                nb_b += 1
                v = p.get('metricsallconversions', p.get('metricsconversions'))
                c[type_conversion(cat, nom_conv)] += nombre(v)
    if not nb_a:
        sys.exit(f'ERREUR aucune ligne « coûts » (requête A) trouvée pour le compte {a.compte}')
    if not nb_b:
        print(f'ALERTE aucune ligne « conversions » (requête B) pour le compte {a.compte} : itinéraires à 0')
    chemin = os.path.join(COLLECTE, 'google_campagnes.csv')
    anciennes = [r for r in csv.DictReader(open(chemin, encoding='utf-8')) if r['reseau'] != a.reseau] if os.path.exists(chemin) else []
    nouvelles = []
    for nom, c in sorted(camp.items()):
        if not c['_a'] or (c['depense'] <= 0 and c['impressions'] <= 0):
            continue
        nouvelles.append({'reseau': a.reseau, 'compte': a.compte, 'campagne': nom, 'depense': round(c['depense'], 2),
                          'impressions': int(c['impressions']), 'clics': int(c['clics']),
                          'part_impressions': '' if c['part_impressions'] is None else round(c['part_impressions'], 4),
                          'itineraires': round(c['itineraires']), 'appels': round(c['appels']), 'visites_site': round(c['visites_site']),
                          'autres_engagements': round(c['autres_engagements']), 'debut': a.debut, 'fin': a.fin})
    with open(chemin, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(anciennes + nouvelles)
    print(f'google_campagnes.csv : {len(nouvelles)} campagnes {a.reseau} ({sum(r["depense"] for r in nouvelles):.2f} €, '
          f'{sum(r["itineraires"] for r in nouvelles)} itinéraires), {len(anciennes)} lignes d’autres réseaux conservées')


if __name__ == '__main__':
    main()
