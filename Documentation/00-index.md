# Documentation Comptal2.1 — Index

> Périmètre : application Tauri/React `Comptal2.1/` à l’état du schéma SQLite v15
> (`SCHEMA_VERSION` dans `src/services/db.ts`). Comptal2 (Electron) reste une
> référence fonctionnelle historique, pas le produit documenté ici.

## Commencer ici

| Document | Contenu |
|---|---|
| [Vue d’ensemble](./vue-ensemble-realisations.md) | État réel des modules, stack, routes et persistance |
| [Architecture et code](./architecture-et-code.md) | Couches, démarrage, IPC, services, fonctions et dépendances |
| [Carte des processus](./carte-processus-donnees.md) | Diagrammes Mermaid des flux métier et techniques |
| [Schéma SQLite v15](./schema-sqlite.md) | Tables, colonnes, relations, payloads et services propriétaires |
| [Plan officialisation](./plan-officialisation-logiciel-comptabilite.md) | Cadre légal A/B/C (hors FEC, hors NF 525, hors PA) |
| [Plan positions A/B/C](./plan-positions-ABC-complement-plugins.md) | Exécution P0 : modes d’usage, factures, conservation, plugins |
| [Plugins / mods](./plugins-mods.md) | Import ZIP déclaratif (JSON, pas de JS) |
| [Export expert-comptable](./format-export-expert-comptable.md) | CSV trésorerie — ce n’est pas un FEC |
| [Conventions métier](./conventions-metier.md) | Dates, montants, catégories, identifiants et documents |
| [Services transverses](./services-transverses.md) | IPC, JSON, logs, SQLite patché, réseau et graphiques |
| [Base de développement](./base-developpement.md) | Création, contenu, activation et remise à zéro du profil de test |
| [Plan directeur actuel](./plans/plan-directeur-actuel.md) | Réalisé, points à consolider et suite logique |

## Pages fonctionnelles

| Page | Route canonique | Documentation | Carte détaillée |
|---|---|---|---|
| Tableau de bord | `#/dashboard` | [dashboard](./pages/dashboard.md) | [flux](./cartes/dashboard.md) |
| Import | `#/upload` | [upload](./pages/upload.md) | [flux](./cartes/upload.md) |
| Édition | `#/edition` | [édition](./pages/edition.md) | [flux](./cartes/edition.md) |
| Finance globale | `#/finance-global` | [finance](./pages/finance-global.md) | [flux](./cartes/finance-global.md) |
| Prévisionnel | `#/previsionnel` | [prévisionnel](./pages/previsionnel.md) | [flux](./cartes/previsionnel.md) |
| Contacts | `#/clients` | [contacts](./pages/contacts.md) | [flux](./cartes/contacts.md) |
| Facturation | `#/facturation` | [facturation](./pages/facturation.md) | [flux](./cartes/facturation.md) |
| Dons | `#/dons` | [dons](./pages/dons.md) | [flux](./cartes/dons.md) |
| Registre | `#/registre` | [registre](./pages/registre.md) | [flux](./cartes/registre.md) |
| Paramètres | `#/parametre` | [paramètres](./pages/parametre.md) | [flux](./cartes/parametre.md) |

Alias conservés : `#/project-management` → Prévisionnel, `#/invoicing` → Facturation,
`#/contacts` → Contacts, `#/association` → Dons.

Les arborescences de fonctions par page sont aussi des Canvas Cursor (ouverts à côté du chat).

## Données et développement

- Le schéma de référence est défini dans `src/services/db.ts`.
- Une base `comptal.db` est associée à chaque profil.
- En développement, les données sont sous `data/` et ignorées par Git.
- Le générateur `scripts/create-dev-database.py` produit un profil complet et reproductible.

## Plans historiques

Le [guide de lecture des plans](./plans/README.md) distingue le plan directeur des archives.
Les documents de `plans/` antérieurs au plan directeur décrivent les intentions au moment de chaque
lot. Ils sont conservés comme historique ; en cas de différence, le code et le
[plan directeur actuel](./plans/plan-directeur-actuel.md) font foi.

| Lot historique | État actuel |
|---|---|
| Plan 1 — Cœur et Paramètres | Réalisé, étendu à Organisation/PDF |
| Plan 2 — Import | Réalisé |
| Plan 3 — Édition | Réalisé, étendu à l’historique annuler/refaire |
| Plan 4 — Dashboard | Réalisé |
| Plan 5 — Finance | Réalisé |
| Plan 6 — Projet | Remplacé et réalisé sous le nom Prévisionnel |
| Contacts, Facturation, Dons, Registre | Réalisés après les plans initiaux |
