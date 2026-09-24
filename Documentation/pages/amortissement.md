# Page Amortissement

Route : `#/amortissement`  
Visibilité menu : `menuVisibility.amortissement` (présets TPE / association ; masqué en mode familiale).

## Rôle

Registre des immobilisations et suivi de l’amortissement (valeur brute, amortissements cumulés, VNC, dotation d’exercice). Source de vérité pour les graphiques Dashboard et Finance globale.

Outil d’aide au suivi : ne génère pas d’écritures FEC ni de journal 6811/28.

## Onglets

1. **Registre** — CRUD immobilisations (type, VA HT, dates, durée, méthode, statut, subvention d’investissement, faible valeur), pièces jointes (PDF, e-mail `.eml`/`.msg`, images).
2. **Suivi** — tableau calculé (années écoulées, amort./an, cumulé, VNC) + graphique VNC dynamique.
3. **Paramètres** — seuil faible valeur (défaut 500 € HT), méthode par défaut, prorata mensuel, barème de durées par type.
4. **Références** — textes légaux sourcés (nuance TPE vs association).

KPIs et panneau détail se mettent à jour selon les filtres (statut, type, recherche). Chaque immobilisation peut être liée à des fichiers via `immobilisation_attachments`.

## Calculs

- **Linéaire** : `(VA − VR) / durée`, prorata mensuel optionnel depuis la mise en service.
- **Dégressif** (CGI art. 39 A) : coefficients 1,25 (3–4 ans), 1,75 (5–6 ans), 2,25 (> 6 ans) ; application sur VNC avec bascule linéaire si plus favorable.
- **Non amortissable** / faible valeur : pas de dotation.

Service : `AmortissementService` (`withLog`), séries `buildAmortissementSeries` pour Chart.js.

## Graphiques

- **Dashboard** : widget sélectionnable `amortissement` (réglages du tableau de bord).
- **Finance globale** : onglet `amortissement` (configurer les graphiques), masqué en mode familiale.

## Cadre légal (indicatif)

| Référence | Contenu |
|-----------|---------|
| Code de commerce L123-12 | Inventaire annuel des actifs |
| CGI art. 39 | Amortissements dans la limite des usages |
| CGI art. 39 A | Amortissement dégressif |
| BOI-BIC-AMT / BOI-BIC-CHG-20-30-10 | Taux usuels, tolérance ≤ 500 € HT |
| ANC règlement 2018-06 | Comptes annuels associations ; comptes 28xx / 6811 |

Toujours vérifier les textes officiels à jour.
