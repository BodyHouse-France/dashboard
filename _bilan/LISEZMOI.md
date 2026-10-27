# Bilan des boutiques : sources et mise à jour

Ce dossier produit `bilan/index.html` (nouvelles boutiques et boutiques historiques, bouton de bascule).
Il commence par `_` : GitHub Pages ne le publie pas.

- `config.json` : boutiques, comptes publicitaires, dates fixes (lancement du 7 sept. 2026, 7 semaines « avant »,
  période « avant » des fiches Google), jalons de la chronologie.
- `collecte/` : dernières données collectées (export du follow-up, Meta, Google Ads), une semaine écrase la précédente.
- `page/` : textes, styles, calculs et graphiques du bilan. `vendor/` : d3.
- `scripts/` : `construire.py` (assemble la page et contrôle les données), `controle.py` (vérifie la page dans un
  navigateur), `extraire.py`, `meta_csv.py`, `google_csv.py` (convertissent les réponses des connecteurs).
- `export_bilan_boutiques.gs` : Apps Script qui écrit chaque matin le Doc « Bilan boutiques - export hebdo »
  à partir du follow-up (ventes, passages, visites du site, dépenses, fiches Google).
- `resume.json` : totaux de la dernière construction, pour vérifier la semaine suivante que les cumuls augmentent.

Mise à jour : chaque lundi matin par une tâche planifiée Claude, selon `PROCEDURE.md`.
La fin de période est le dimanche précédent. Les ventes sont comparées aux 7 semaines d'avant campagne
(nouvelles boutiques) ou aux mêmes semaines de 2025 (boutiques historiques).

Reconstruire à la main avec les données présentes : `python3 _bilan/scripts/construire.py`
(option `--fin AAAA-MM-JJ` pour fixer la fin de période).
