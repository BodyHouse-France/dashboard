# Mise à jour hebdomadaire du bilan des boutiques

Procédure suivie chaque lundi matin par la tâche planifiée Claude. Elle recalcule
`bilan/index.html` (publié sur https://bodyhouse-france.github.io/dashboard/bilan/) avec les données
arrêtées au dimanche précédent (`FIN`). Tout se fait depuis la racine du dépôt `bodyhouse-france/dashboard`.

Règles :
- Aucun chiffre n'est recopié à la main : les réponses des connecteurs sont extraites du journal de la session
  par `_bilan/scripts/extraire.py` puis converties par script. Si une conversion échoue, le dire dans le compte rendu
  plutôt que de saisir des valeurs.
- Ne pas modifier `_bilan/page/` (textes et graphiques du bilan). `_bilan/config.json` ne se modifie que dans les cas
  prévus ci-dessous (identifiant du compte Google Ads BH DOR, nouvelle boutique évidente), en le signalant.
- Ne jamais écrire le nom de l'ancienne enseigne des boutiques reprises, nulle part (commit, compte rendu, page).
- Si une source est indisponible, garder ses données précédentes : le bilan affiche alors en en-tête la date
  jusqu'à laquelle cette source va. Publier quand même si `construire.py` réussit.

## 0. Préparer

Les variables du shell ne se conservent pas d'une commande à l'autre : la fin de période et l'heure de début
sont gardées dans des fichiers.

```bash
mkdir -p /tmp/bilan
python3 -c "from datetime import date,timedelta as t; d=date.today(); print(d-t(days=d.weekday()+1))" > /tmp/bilan/fin
date -u +%Y-%m-%dT%H:%M:%S > /tmp/bilan/debut
git show HEAD:bilan/index.html > /tmp/bilan/ancien.html
echo "Fin de période : $(cat /tmp/bilan/fin)"
```

## 1. Ventes et fiches Google (follow-up)

L'Apps Script `export_bilan_boutiques.gs` (projet Apps Script du suivi des ventes) réécrit chaque matin vers 8h
le Google Doc « Bilan boutiques - export hebdo ».

1. Connecteur Google Drive : `search_files` avec `title = 'Bilan boutiques - export hebdo'`, puis
   `read_file_content` sur l'identifiant trouvé (le plus récemment modifié s'il y en a plusieurs).
2. Écrire son contenu dans la collecte :
   ```bash
   python3 _bilan/scripts/extraire.py read_file_content /tmp/bilan/drive --depuis $(cat /tmp/bilan/debut) --texte-dernier _bilan/collecte/followup.txt
   head -1 _bilan/collecte/followup.txt   # EXPORT;1;<date de l'export>;… : doit dater d'aujourd'hui
   ```
3. Si le Doc est introuvable ou daté d'avant aujourd'hui : `git checkout _bilan/collecte/followup.txt` (garder
   l'export précédent) et le signaler (l'export automatique ne tourne plus : ouvrir le projet Apps Script, lancer
   `exporterBilanBoutiques`, vérifier le déclencheur).

## 2. Meta Ads

Paramètres communs à chaque appel `ads_get_ad_entities` : `advertiser_job` = `report_measure_or_look_up`,
`include_additional_context` = false, `reporting_purpose` = `["metric_lookup"]`, `limit` = 1000,
plus `client_conversation_id` et `client_model` comme le demande la description de l'outil.
Comptes et dates de début : `_bilan/config.json` (`reseaux.<réseau>.meta`).

Pour chaque compte de chaque réseau (nouvelles : 1 compte depuis le 2026-09-01 ; historiques : 4 comptes depuis le 2026-09-07) :

| Appel | level | time_range | time_increment | fields | filtering |
|---|---|---|---|---|---|
| Totaux par campagne | `campaign` | `{"since":"<début du réseau>","until":"<FIN>"}` | (aucun) | `id, name, objective, amount_spent, impressions, reach, clicks, link_click, post_engagement, post_reaction, comment, post_save, like, results, instagram_profile_follow_v2` | (aucun) |
| Compte par jour | `ad_account` | `{"since":"2026-09-07","until":"<FIN>"}` | `"1"` | `amount_spent, impressions, link_click, post_engagement, like` | (aucun) |
| Campagnes exclues par jour (historiques seulement, les 4 comptes) | `campaign` | `{"since":"2026-09-07","until":"<FIN>"}` | `"1"` | `id, name, amount_spent, impressions, link_click, post_engagement, like` | `[{"field":"campaign.name","operator":"CONTAINS_ANY","value":["NATIONAL","Recrutement"]}]` |

Si la réponse contient `pagination.next_cursor`, rappeler avec `cursor` et les mêmes paramètres jusqu'à épuisement.
Un compte inaccessible : passer, le signaler (ses lignes précédentes restent).

```bash
python3 _bilan/scripts/extraire.py ads_get_ad_entities /tmp/bilan/meta --depuis $(cat /tmp/bilan/debut)
python3 _bilan/scripts/meta_csv.py /tmp/bilan/meta
```
Le script affiche, par compte, le nombre de campagnes et la dépense : vérifier que chaque compte appelé y figure.

## 3. Google Ads

Seulement si le connecteur Google Ads est disponible (chercher ses outils ; s'il ne l'est pas, passer à l'étape 4
et le signaler). Pour chaque réseau, `compte` et `debut` dans `_bilan/config.json` (`reseaux.<réseau>.google`) ;
les comptes sont sous le MCC 7676164331 (`login_customer_id`).

- Historiques : compte 5815462274.
- Nouvelles : si `compte` vaut `null`, trouver le compte BH DOR : lister les comptes du MCC
  (`SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager FROM customer_client`),
  puis, sur chaque compte non gestionnaire autre que 5815462274, chercher une campagne dont le nom contient
  `| ANGERS |`. Écrire l'identifiant trouvé dans `config.json` et le signaler.

Deux requêtes par compte, `<debut>` et `<FIN>` au format AAAA-MM-JJ :

```sql
SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.search_impression_share
FROM campaign
WHERE segments.date BETWEEN '<debut>' AND '<FIN>' AND campaign.advertising_channel_type = 'SEARCH'
```
```sql
SELECT campaign.name, segments.conversion_action_category, segments.conversion_action_name, metrics.all_conversions
FROM campaign
WHERE segments.date BETWEEN '<debut>' AND '<FIN>' AND campaign.advertising_channel_type = 'SEARCH' AND metrics.all_conversions > 0
```
Après les requêtes d'un réseau (les extraire à nouveau pour le second réseau) :
```bash
python3 _bilan/scripts/extraire.py Google_Ads /tmp/bilan/google_<réseau> --depuis $(cat /tmp/bilan/debut)
python3 _bilan/scripts/google_csv.py /tmp/bilan/google_<réseau> --reseau <réseau> --compte <id> --debut <debut> --fin $(cat /tmp/bilan/fin)
```
`Google_Ads` est un motif du nom des outils du connecteur (l'adapter s'il s'appelle autrement) ; `google_csv.py`
ne garde que les réponses du compte indiqué qui contiennent des campagnes.
Si les itinéraires d'un réseau baissent par rapport à la semaine précédente (alerte de `construire.py`),
refaire la seconde requête avec `metrics.conversions` à la place de `metrics.all_conversions` et garder
la version cohérente avec les semaines précédentes.

## 4. Construire et contrôler

```bash
python3 _bilan/scripts/construire.py            # fin = dernier dimanche ; code 1 = erreur bloquante
python3 _bilan/scripts/controle.py --reference /tmp/bilan/ancien.html
```
- `construire.py` affiche les totaux par réseau, puis les ALERTES (non bloquantes) et les ERREURS (bloquantes).
  En cas d'erreur : ne rien publier, corriger si la cause est dans la collecte (appel manquant, export ancien),
  sinon s'arrêter et le signaler.
- `controle.py` vérifie la page dans les deux réseaux, sur chaque onglet, en 1280 et 390 px. Il liste aussi les
  chiffres qui ont changé depuis la semaine précédente : contrôler qu'ils sont plausibles (cumuls Meta et Google
  en hausse, une semaine de ventes de plus, pas de valeur aberrante).

## 5. Publier

```bash
git add bilan/index.html _bilan/collecte _bilan/resume.json _bilan/config.json
git commit -m "Bilan boutiques : données au $(cat /tmp/bilan/fin)"
git push origin HEAD:main
```
GitHub Pages republie le site en une à deux minutes.

## 6. Compte rendu

Message court, en français, sans superlatifs : date de fin, dépenses Meta et Google par réseau, nombre de semaines
de ventes, alertes de `construire.py` (sources en retard, campagnes non rattachées, écarts), actions attendues de
Sébastien s'il y en a, et le lien https://bodyhouse-france.github.io/dashboard/bilan/
