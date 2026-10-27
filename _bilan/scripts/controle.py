"""Contrôle visuel automatique du bilan construit (Playwright / Chromium).

Ouvre la page dans les deux réseaux et sur chaque onglet, à 1280 px et 390 px de large, et vérifie :
pas d'erreur JavaScript, pas de « NaN », « undefined », « Infinity » ou « null » affiché, pas de chiffre resté
vide (« — ») hors tableaux, pas de graphique vide, pas de défilement horizontal.
Avec --reference autre.html : liste les chiffres affichés qui diffèrent entre les deux pages.

Usage : python3 _bilan/scripts/controle.py [bilan/index.html] [--reference ancien.html] [--captures dossier]
Code de sortie 1 si un contrôle échoue.
"""
import json, os, sys
from playwright.sync_api import sync_playwright

PAGES = ['synthese', 'meta', 'google', 'fiches', 'ventes', 'boutique']
# chiffres pouvant rester vides par construction (pas de valeur pour ce réseau)
VIDES_ADMIS = {'abonnes_instagram@libelle=Campagne nationale Trafic', 'depense@libelle=Campagne nationale Trafic',
               'depense@libelle=Recrutement franchise'}

LIRE = """() => {
  const out = {};
  document.querySelectorAll('[data-source][data-field]').forEach((e, i) => {
    if (e.closest('table') || e.offsetParent === null) return;
    out[e.dataset.source + '.' + e.dataset.field + '@' + (e.dataset.where || '') + '#' + i] = e.textContent.trim();
  });
  document.querySelectorAll('table.bh-table').forEach((t) => {
    if (t.offsetParent === null) return;
    t.querySelectorAll('tbody tr').forEach((tr, i) => {
      const cells = [...tr.querySelectorAll('td')].filter((td) => td.offsetParent !== null).map((td) => td.textContent.trim());
      out[t.id + '#' + cells[0]] = cells.join(' | ');
    });
  });
  return out;
}"""


def parcourir(chemin, largeur, captures=None):
    rapport, valeurs = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': largeur, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto('file://' + os.path.abspath(chemin))
        pg.wait_for_timeout(700)
        for mode in ('nouvelles', 'historiques'):
            if mode == 'historiques':
                pg.click('#switch-reseau')
                pg.wait_for_timeout(300)
            for onglet in PAGES:
                pg.click(f'#onglet-{onglet}')
                pg.wait_for_timeout(350)
                if captures:
                    os.makedirs(captures, exist_ok=True)
                    pg.screenshot(path=f'{captures}/{mode}_{largeur}_{onglet}.png', full_page=True)
                txt = pg.inner_text(f'#{onglet}') + pg.inner_text('header')
                for mot in ('NaN', 'undefined', 'Infinity', 'null'):
                    if mot in txt:
                        rapport.append(f'{mode}/{onglet} ({largeur}px) : « {mot} » affiché')
                vides = pg.evaluate(f"""[...document.querySelectorAll('#{onglet} [data-source][data-field], #bilan header [data-source][data-field]')]
                    .filter(e => !e.closest('table') && e.offsetParent !== null && e.textContent.trim() === '—')
                    .filter(e => e.dataset.source !== 'synthese_boutiques') // par boutique, vide = pas de campagne ou pas de suivi
                    .map(e => e.dataset.field + '@' + (e.dataset.where || ''))""")
                vides = [v for v in vides if v not in VIDES_ADMIS]
                if vides:
                    rapport.append(f'{mode}/{onglet} ({largeur}px) : chiffres vides {sorted(set(vides))}')
                graphes_vides = pg.evaluate(f"""[...document.querySelectorAll('#{onglet} .bh-graph')].filter(g => g.offsetParent !== null && !g.querySelector('svg') && !g.textContent.trim()).map(g => g.id)""")
                if graphes_vides:
                    rapport.append(f'{mode}/{onglet} ({largeur}px) : graphiques vides {graphes_vides}')
                if pg.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1'):
                    rapport.append(f'{mode}/{onglet} ({largeur}px) : défilement horizontal')
                for k, v in pg.evaluate(LIRE).items():
                    valeurs[f'{mode}/{onglet}/{k}'] = v
        rapport += [f'erreur JavaScript ({largeur}px) : {e}' for e in errs]
        b.close()
    return rapport, valeurs


def main():
    args = [a for a in sys.argv[1:]]
    ref = args[args.index('--reference') + 1] if '--reference' in args else None
    cap = args[args.index('--captures') + 1] if '--captures' in args else None
    pos = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or not args[i - 1].startswith('--'))]
    chemin = pos[0] if pos else os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'bilan', 'index.html')
    rapport, valeurs = parcourir(chemin, 1280, cap)
    r2, _ = parcourir(chemin, 390, cap)
    rapport += r2
    if ref:
        _, avant = parcourir(ref, 1280)
        norm = lambda k: k.rsplit('#', 1)[0] if '.' in k.split('/')[-1].split('#')[0] else k
        A = {norm(k): v for k, v in avant.items()}
        B = {norm(k): v for k, v in valeurs.items()}
        diff = [(k, A[k], B[k]) for k in sorted(set(A) & set(B)) if A[k] != B[k]]
        print(f'Comparaison avec {ref} : {len(set(A) & set(B))} valeurs communes, {len(diff)} différentes')
        for k, a, b in diff[:60]:
            print(f'  {k}\n     avant : {a}\n     après : {b}')
    if rapport:
        print('\n'.join('ÉCHEC  ' + r for r in rapport))
        sys.exit(1)
    print(f'Contrôle OK : {chemin} ({len(valeurs)} valeurs lues, 2 réseaux × {len(PAGES)} onglets, 1280 et 390 px)')


if __name__ == '__main__':
    main()
