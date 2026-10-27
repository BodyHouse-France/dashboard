"""Copie dans des fichiers les résultats bruts des outils (MCP) appelés pendant la session en cours.

Les résultats sont lus dans le journal de la session (~/.claude/projects/**/<session>.jsonl) ou, s'ils
étaient trop longs pour la conversation, dans le fichier tool-results/ vers lequel le journal renvoie.
Rien n'est recopié à la main : les chiffres viennent tels quels des connecteurs.

Usage : python3 extraire.py <motif nom d'outil> <dossier de sortie> [--depuis <horodatage ISO>] [--texte-dernier <fichier>]
Chaque résultat est écrit dans <dossier>/<n°>_<outil>.json avec { "outil", "entree", "texte" }.
--texte-dernier : écrit aussi le texte du dernier résultat dans <fichier> (contenu du Doc pour read_file_content).
"""
import glob, json, os, re, sys

def journal():
    fichiers = glob.glob(os.path.expanduser('~/.claude/projects/**/*.jsonl'), recursive=True)
    if not fichiers:
        sys.exit('Journal de session introuvable sous ~/.claude/projects')
    return max(fichiers, key=os.path.getmtime)

def texte_resultat(contenu, dossier_journal):
    if isinstance(contenu, list):
        t = '\n'.join(b.get('text', '') for b in contenu if isinstance(b, dict) and b.get('type') == 'text')
    else:
        t = str(contenu)
    # résultat volumineux enregistré à part : le journal ne contient qu'un renvoi vers le fichier
    m = re.search(r'(/[^\s"\'<>]*tool-results/[^\s"\'<>]+\.(?:txt|json))', t)
    if m and os.path.exists(m.group(1)) and len(t) < 5000:
        return open(m.group(1), encoding='utf-8').read()
    return t

def texte_utile(t):
    """Contenu d'une réponse JSON (fileContent, content…) : la plus longue chaîne trouvée ; sinon le texte brut."""
    try:
        o = json.loads(t)
    except ValueError:
        return t
    chaines = []
    def parcourir(x):
        if isinstance(x, str):
            chaines.append(x)
        elif isinstance(x, dict):
            for v in x.values():
                parcourir(v)
        elif isinstance(x, list):
            for v in x:
                parcourir(v)
    parcourir(o)
    return max(chaines, key=len) if chaines else t


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    motif, sortie = sys.argv[1], sys.argv[2]
    depuis = sys.argv[sys.argv.index('--depuis') + 1] if '--depuis' in sys.argv else ''
    os.makedirs(sortie, exist_ok=True)
    j = journal()
    appels, n, dernier = {}, 0, None
    for ligne in open(j, encoding='utf-8'):
        try:
            o = json.loads(ligne)
        except ValueError:
            continue
        if depuis and str(o.get('timestamp', '9999')) < depuis:
            continue
        contenu = (o.get('message') or {}).get('content')
        if not isinstance(contenu, list):
            continue
        for b in contenu:
            if b.get('type') == 'tool_use':
                appels[b['id']] = (b['name'], b.get('input', {}))
            elif b.get('type') == 'tool_result' and b.get('tool_use_id') in appels:
                nom, entree = appels[b['tool_use_id']]
                if motif not in nom or b.get('is_error'):
                    continue
                n += 1
                court = nom.split('__')[-1]
                dernier = texte_resultat(b['content'], os.path.dirname(j))
                with open(os.path.join(sortie, f'{n:03d}_{court}.json'), 'w', encoding='utf-8') as f:
                    json.dump({'outil': nom, 'entree': entree, 'texte': dernier}, f, ensure_ascii=False)
    print(f'{n} résultat(s) « {motif} » extrait(s) de {j} vers {sortie}')
    if '--texte-dernier' in sys.argv:
        if dernier is None:
            sys.exit('Aucun résultat : rien à écrire pour --texte-dernier')
        cible = sys.argv[sys.argv.index('--texte-dernier') + 1]
        open(cible, 'w', encoding='utf-8').write(texte_utile(dernier))
        print(f'Texte du dernier résultat écrit dans {cible}')

if __name__ == '__main__':
    main()
