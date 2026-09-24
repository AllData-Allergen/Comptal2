# Comptal2.1 — Vue d'ensemble des réalisations

**Version** : 2.1.0  
**Identifiant** : `com.leopaul.comptal21`  
**Stack** : Tauri 2 + React 18 + TypeScript + Vite + Tailwind + SQLite

---

## 1. Objectif du projet

Comptal2.1 est une refonte complète de l'application de comptabilité personnelle Comptal2. Elle conserve l'expérience utilisateur et la charte visuelle de référence, tout en remplaçant :

- **Electron** → **Tauri 2** (binaire plus léger, sécurité renforcée)
- **Fichiers CSV/JSON métier** → **SQLite** (une base `comptal.db` par profil)
- **Agrégations JavaScript en mémoire** → **requêtes SQL** (performance)

Il n'y a pas de backend réseau : toutes les données restent locales sur la machine de l'utilisateur.

---

## 2. État fonctionnel

| Domaine | Statut | Livrables principaux |
|---|---|---|
| Cœur + Paramètres | Réalisé | Tauri 2, profils, SQLite v7, logs, updater, migration, Organisation/PDF |
| Import | Réalisé | CSV/Excel/manuel, mapping, modèles, détection des chevauchements |
| Édition | Réalisé | Table dense, édition par `id`, annuler/refaire, auto-catégorisation, doublons |
| Dashboard | Réalisé | KPI, résumé, graphiques et filtres SQL |
| Finance globale | Réalisé | Analyses temporelles, soldes, catégories et bilan |
| Prévisionnel | Réalisé | Prévisions persistées, grille, groupes, récurrences et widgets |
| Contacts | Réalisé | Particuliers/entreprises, groupements, fiches et liens documentaires |
| Facturation | Réalisé | Devis, factures liées, postes, paiements, pièces jointes et PDF |
| Dons | Réalisé | Journal unifié, corrélations, reçus fiscaux et signature |
| Registre | Réalisé | Documents de période, PDF, éléments, liens et pièces jointes |

---

## 3. Architecture technique

### 3.1 Couches applicatives

```
┌─────────────────────────────────────────────────────────┐
│  React (pages + composants)                             │
│  HashRouter — routes #/dashboard, #/upload, …           │
├─────────────────────────────────────────────────────────┤
│  Services TypeScript par domaine                        │
├─────────────────────────────────────────────────────────┤
│  Db.ts — couche SQLite (plugin @tauri-apps/plugin-sql)  │
├─────────────────────────────────────────────────────────┤
│  tauriBridge — commandes Rust custom (FS, ZIP, session) │
├─────────────────────────────────────────────────────────┤
│  Tauri 2 (Rust) — plugins sql, dialog, updater, opener  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Arborescence source

```
Comptal2.1/
├── src/
│   ├── main.tsx              # Bootstrap : Logger → Settings → Profil → React
│   ├── App.tsx               # Routes + ToastContainer
│   ├── pages/                # 10 pages fonctionnelles
│   ├── components/           # UI par domaine (Dashboard, Upload, …)
│   ├── services/             # Logique métier et accès données
│   ├── types/                # Modèles TypeScript
│   ├── utils/                # Montants, dates, graphiques
│   ├── hooks/                # useTheme
│   ├── contexts/             # ZoomContext
│   ├── i18n/                 # fr.json, en.json
│   └── styles/               # CSS global et par page
├── src-tauri/
│   ├── src/lib.rs            # Plugins + invoke_handler
│   ├── src/commands.rs       # Commandes IPC custom
│   └── src/paths.rs          # Racine data (dev vs prod)
└── data/                     # Créé au runtime
    ├── parameter/settings.json
    ├── profils/{id}/comptal.db
    └── logs/{sessionId}_*.jsonl
```

### 3.3 Persistance des données

| Emplacement | Format | Contenu |
|-------------|--------|---------|
| `data/parameter/settings.json` | JSON | Langue, thème, zoom, fenêtre, menus visibles, profil actif |
| `data/profils/{id}/info.json` | JSON | Métadonnées profil (id, nom, date création) |
| `data/profils/{id}/comptal.db` | SQLite | Comptes, catégories, transactions, imports, stats auto-cat, projets, templates |
| `data/logs/` | JSONL | Logs app, erreurs, data, perf par session |

**Dev** : `data/` est dans le dépôt (`Comptal2.1/data/`).  
**Prod** : `%APPDATA%/com.leopaul.comptal21/data/` (ou équivalent selon OS).

---

## 4. Schéma SQLite (version 15)

Tables créées par `ensureSchema()` dans `src/services/db.ts` (`SCHEMA_VERSION = 15`) :

### v1 — Cœur comptable
- `accounts` — comptes bancaires (code, nom, couleur, solde initial)
- `categories` — catégories de dépenses/revenus
- `imports` — historique des imports par fichier/compte
- `transactions` — lignes comptables (PK `id` stable)
- `autocat_stats` — statistiques mots → catégorie

### v2 — Projection
- `projects` — projets de projection budgétaire
- `project_subscriptions` — abonnements récurrents liés à un projet

### v3 — Templates d'import
- `import_templates` — mapping de colonnes sauvegardé par modèle de relevé

### v4 — Arbre prévisionnel
- Colonnes `parent_id`, `is_group`, `end_date`, `color`, `sort_order`
- Index des lignes par projet et parent

### v5 à v7 — Organisation, contacts, facturation et dons
- `invoice_emetteur`, `invoice_settings`, `pdf_templates`, `legal_mentions`
- `clients`, `contact_groups`, `devis`, `factures`
- `postes_catalogue`, `postes_groupes`, `secteurs_activite`
- `association_config`, `donateurs`, `donateur_transactions`, `dons_manuels`, `registre_recus`

### v8 à v14 — Registre, dons unifiés, palettes et réglages
- `register_settings`, `register_documents`, `register_items`, `register_links`, `register_attachments`
- `donations`, `donation_rules`
- `color_palettes`, `label_rules`, `dashboard_settings`, `app_settings`, `category_groups`

### v15 — Plugins et archivage des transactions
- `plugin_state` — activation des plugins déclaratifs par profil
- `transactions.deleted_at` — archivage réversible utilisé par l’historique d’édition

**Conventions métier** :
- Dates en ISO `yyyy-MM-dd`
- Débits ≤ 0, crédits ≥ 0
- Catégorie `X` : exclue des KPI
- Catégorie `Y` : exclue de certains graphiques Dashboard

---

## 5. Services fondation (Plan 1)

| Service | Rôle |
|---------|------|
| `Logger` | Session JSONL, `withLog()`, logs perf si requête > 100 ms |
| `Db` | Ouverture SQLite par profil, migrations, `select`/`execute`/`inTransaction` |
| `SettingsService` | Lecture/écriture `settings.json`, cache mémoire, `subscribe()` |
| `ProfileService` | CRUD profils, activation, export/import ZIP |
| `ConfigService` | CRUD comptes et catégories en SQL |
| `WindowService` | Presets fenêtre via API Tauri window |
| `UpdateService` | `tauri-plugin-updater` : vérifier, télécharger, installer, relancer |
| `MigrationService` | Import profil Comptal2 (CSV+JSON) → SQLite |
| `tauriBridge` | Pont typé vers commandes Rust (FS, ZIP, chemins externes) |

---

## 6. Pages implémentées

### Dashboard (`/dashboard`)
- Filtres comptes, catégories, période, recherche libellé
- Onglets Résumé (KPI, mini-cartes) et Graphiques (Chart.js)
- Barres par catégorie, revenus/dépenses et courbe de soldes ; export CSV

### Upload (`/upload`)
- Wizard multi-étapes : fichier → feuilles Excel → mapping → aperçu → import
- Support CSV, XLSX, saisie manuelle
- Templates de mapping réutilisables (schéma v3)
- Détection de chevauchements de période par compte

### Édition (`/edition`)
- Table éditable 500 lignes/page, filtres SQL, recherche debounce 300 ms
- Édition inline par `id` (UPDATE unitaire)
- Auto-catégorisation statistique + libellés routiniers (`LabelRuleService`)
- Détection et suppression des doublons, historique annuler/refaire

### Finance globale (`/finance-global`)
- Onglets **Mensuel**, **Solde**, **Projection vs Réalité**, **Bilan**
- Onglets **Facturation**, **Dons**, **Contacts** (insights, visibilité persistée)
- Filtres et granularité regroupés dans une sidebar droite

### Paramètres (`/parametre`)
- 7 onglets : Général, Profils, Comptes, Catégories, Données, Organisation, À propos
- Migration Comptal2, reconstruction stats auto-cat, mises à jour

### Prévisionnel (`/previsionnel`)
- Création et chargement de prévisions
- Grille de lignes/groupes, colonnes configurables et split redimensionnable
- Récurrences et widgets de synthèse

### Contacts (`/clients`)
- Contacts particuliers/entreprises, groupements, notes et coordonnées
- Accès aux devis et factures liés

### Facturation (`/facturation`)
- Onglets Devis/Factures et Postes
- Devis conservés/caducs, factures rattachées, paiements et rapprochement bancaire

### Dons (`/dons` ; alias historique `/association` → redirection)
- Journal unifié (`DonationService`), rapprochement de transactions et corrélations
- Reçus fiscaux avec signature ; identité associative dans Paramètres → Organisation
- États figés dans Registre ; donateurs = contacts à rôle `donateur`

### Registre (`/registre`)
- Génération de documents de période (facturation, trésorerie, dons, références)
- PDF, éléments libres, liens et pièces jointes par profil

---

## 7. Layout et navigation

- **MainLayout** : sidebar repliable, zone de contenu avec zoom CSS
- **Sidebar** : 9 entrées de menu, visibilité configurable (`menuVisibility` dans settings)
- **Thème** : clair/sombre via `useTheme` + variables CSS
- **Zoom** : 50–200 % via `ZoomContext`
- **i18n** : français et anglais (`react-i18next`)

Alias de compatibilité :
- `/project-management` → `/previsionnel`
- `/invoicing` → `/facturation`
- `/contacts` → `/clients`
- `/association` → `/dons`

---

## 8. Commandes Tauri (IPC Rust)

Commandes custom dans `src-tauri/src/commands.rs` :

| Commande | Usage |
|----------|-------|
| `get_session_info` | ID session, racine data, version, mode dev |
| `read_text_file` / `write_text_file` / `append_text_line` | FS relatif sous `data/` |
| `read_dir` / `path_exists` / `mkdirs` / `delete_file` / `delete_dir` / `copy_dir` | Gestion arborescence |
| `zip_dir` / `unzip_to` | Export/import profil ZIP |
| `read_external_*` / `write_external_*` / `external_exists` | Chemins absolus (migration, export CSV) |
| `open_path` | Ouvrir dossier/fichier dans l'OS |

Plugins Tauri utilisés : `sql`, `dialog`, `updater`, `process`, `opener`.

---

## 9. Démarrage de l'application

Séquence dans `src/main.tsx` :

1. `Logger.init()` — session de logs
2. `SettingsService.load()` — thème, langue, fenêtre
3. `ProfileService.ensureInitialized()` — profil actif + `Db.openForProfile()`
4. Rendu React (`App` → `HashRouter`)

---

## 10. Consolidations restantes

| Élément | Détail |
|---|---|
| Tests automatisés | Fonctions pures, services SQLite et migrations |
| Migrations | Formaliser les étapes v4-v7 et conserver la réparation idempotente |
| Intégrité métier | Renforcer les liens actuellement stockés dans les payloads JSON |
| Livraison | Valider l’updater et les artefacts sur un canal de préproduction |
| Onboarding | Parcours guidé optionnel |

---

## 11. Commandes de développement

```bash
cd Comptal2.1
npm run tauri:dev    # Dev : Vite (port 5174) + fenêtre Tauri
npm run typecheck    # Vérification TypeScript
npm run tauri:build  # Build installateur (sur demande uniquement)
```

---

## 12. Références internes

- Plans détaillés : `Documentation/plans/`
- Index documentation : `Documentation/00-index.md`
- Carte processus données : `Documentation/carte-processus-donnees.md`
