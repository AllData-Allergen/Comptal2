# Carte des processus de données — Comptal2.1

Ce document décrit comment les données circulent dans Comptal2.1 : du démarrage à la persistance, en passant par l'import, l'édition et les agrégats.

---

## 1. Vue globale

La vue est volontairement séparée en trois schémas. Chaque schéma se lit de gauche à droite et
répond à une seule question : comment l'application démarre, comment les données entrent, puis où
elles sont consultées.

### Démarrage et stockage technique

```mermaid
flowchart LR
    L[1. Logger.init] --> S[2. SettingsService.load]
    S --> P[3. ProfileService.ensureInitialized]
    P --> D[4. Db.openForProfile]

    L -. écrit .-> LOGS[(logs JSONL)]
    S -. lit / écrit .-> SETTINGS[(settings.json)]
    P -. lit / écrit .-> INFO[(info.json)]
    D -. ouvre .-> SQL[(comptal.db)]
```

### Entrée et modification des données

```mermaid
flowchart LR
    CSV[Relevé CSV/XLSX] --> UP[Upload]
    MAN[Saisie manuelle] --> UP
    UP -->|INSERT| SQL[(comptal.db)]

    LEGACY[Dossier Comptal2] --> PARAM[Paramètres · migration]
    PARAM -->|INSERT| SQL

    USER[Édition utilisateur] --> EDIT[Édition]
    EDIT -->|INSERT / UPDATE / DELETE| SQL
```

### Analyses et export CSV

```mermaid
flowchart LR
    SQL[(comptal.db)] -->|agrégats SELECT| DASH[Dashboard]
    SQL -->|agrégats SELECT| FIN[Finance]
    DASH -->|export CSV| EXPORT[Fichier choisi]
```

### Autres modules et archives

```mermaid
flowchart LR
    SQL[(comptal.db)] <-->|CRUD prévisions| PREV[Prévisionnel]
    SQL <-->|CRUD contacts| CONTACT[Contacts]
    SQL <-->|CRUD documents| INV[Facturation]
    SQL <-->|CRUD dons et reçus| DONS[Dons]

    PARAM[Paramètres] -->|export / import ZIP| ARCHIVE[Archive de profil]
```

---

## 2. Processus de démarrage

| Étape | Composant | Action | Fichiers touchés |
|-------|-----------|--------|------------------|
| 1 | `Logger.init()` | Génère `sessionId`, récupère `dataRoot` via `get_session_info` | `data/logs/{sessionId}_app.jsonl` |
| 2 | `SettingsService.load()` | Lit ou crée les paramètres globaux | `data/parameter/settings.json` |
| 3 | `applyThemeToDocument()` | Applique le thème CSS | — |
| 4 | `i18n.changeLanguage()` | Charge la langue | — |
| 5 | `WindowService.apply()` | Applique dimensions fenêtre | — |
| 6 | `ProfileService.ensureInitialized()` | Charge/crée profil actif | `data/profils/{id}/info.json` |
| 7 | `Db.openForProfile(id)` | Ouvre SQLite, réparation/migrations jusqu’à v15 | `data/profils/{id}/comptal.db` |

**Changement de profil** (Paramètres → Profils) :
1. `ProfileService.setActive(newId)`
2. `SettingsService.save({ activeProfileId })`
3. `Db.close()` puis `Db.openForProfile(newId)`
4. `profileEpoch++` dans Paramètres pour remonter les onglets liés aux données

---

## 3. Modèle de données SQLite

### Relations principales

Les relations sont réparties par domaine afin d'éviter un graphe relationnel unique où les liens se
superposent.

#### Transactions

```mermaid
erDiagram
    accounts ||--o{ transactions : "account_id"
    imports ||--o{ transactions : "import_id"
    categories ||--o{ transactions : "category_code"

    accounts {
        int id PK
        string code UK
        string name
        string color
        real initial_balance
    }

    categories {
        int id PK
        string code UK
        string name
        string color
    }

    transactions {
        int id PK
        int account_id FK
        string date
        string value_date
        real debit
        real credit
        string label
        string category_code
        int import_id FK
    }

    imports {
        int id PK
        string filename
        int account_id FK
        string date_start
        string date_end
        int row_count
    }
```

#### Imports, modèles et auto-catégorisation

```mermaid
erDiagram
    accounts ||--o{ imports : "account_id"
    accounts ||--o{ import_templates : "account_id"

    accounts {
        int id PK
        string code UK
    }

    imports {
        int id PK
        int account_id FK
        string filename
    }

    import_templates {
        int id PK
        string name
        int account_id FK
        string column_roles_json
    }
```

#### Prévisionnel

```mermaid
erDiagram
    projects ||--o{ project_subscriptions : "project_id"

    projects {
        int id PK
        string name
        string start_date
        string end_date
        real initial_balance
    }

    project_subscriptions {
        int id PK
        int project_id FK
        string type
        real amount
        string periodicity
    }
```

#### Relations métier sans clé étrangère SQLite

##### Contacts et facturation

```mermaid
erDiagram
    clients ||--o{ devis : "client_id logique"
    clients ||--o{ factures : "client_id logique"
    devis ||--o{ factures : "devis_origine logique"
```

##### Dons historiques

```mermaid
erDiagram
    donateurs ||--o{ dons_manuels : "donateur_id logique"
    donateurs ||--o{ donateur_transactions : "donateur_id logique"
```

Les relations des trois premières vues sont contraintes par SQLite lorsqu’une clause `REFERENCES`
est présente, à l'exception de `categories` → `transactions`. Les deux dernières vues montrent des
identifiants métier sans contrainte FK ; les services doivent donc préserver leur cohérence.

### Tables à payload JSON

```mermaid
flowchart TB
    subgraph facturation [Facturation]
        direction LR
        EM[invoice_emetteur] --> EJS[EmetteurExtended]
        IS[invoice_settings] --> IJS[InvoiceSettings]
        DV[devis] --> DJS[Devis]
        FA[factures] --> FJS[Facture + paiements]
    end

    subgraph contacts [Contacts]
        direction LR
        CL[clients] --> CJS[Client]
        CG[contact_groups] --> GJS[ContactGroupe]
    end

    subgraph association [Association]
        direction LR
        AC[association_config] --> AJS[AssociationConfig]
        DO[donateurs] --> DOJS[Donateur]
        DM[dons_manuels] --> DMJS[Don]
        RR[registre_recus] --> RRJS[ReceiptEntry]
    end
```

Les colonnes dédiées (`numero`, `statut`, `client_id`, `updated_at`, etc.) servent au tri et à la
recherche. Le payload est la représentation métier complète.

### Conventions de montants et dates

| Règle | Détail |
|-------|--------|
| Dates | Stockées en `TEXT` ISO `yyyy-MM-dd` |
| Débits | Valeurs ≤ 0 |
| Crédits | Valeurs ≥ 0 |
| Catégorie `X` | Exclue des KPI (`excludeCategories`) |
| Catégorie `Y` | Exclue de certains graphiques Dashboard |
| Solde compte | `initial_balance` + SUM(credit + debit) jusqu'à la date cible |

---

## 4. Processus d'import (Upload)

```mermaid
flowchart TD
    A[Fichier CSV/XLSX] --> B[FileDetectionService]
    B --> C[ColumnMappingService]
    C --> D[transformRows]
    D --> E[Aperçu UI]
    E --> F{Chevauchement?}
    F -->|Non| H[ImportService.importRows]
    F -->|Oui| G[Demander confirmation]
    G -->|Confirmer| H
    H --> I[(INSERT transactions + imports)]
```

| Étape | Service | Opération SQL |
|-------|---------|---------------|
| Détection format | `FileDetectionService` | — (parse fichier en mémoire) |
| Mapping colonnes | `ColumnMappingService` | — |
| Transformation | `transformRows()` | — |
| Vérification chevauchement | `ImportService.findOverlaps()` | `SELECT` sur `imports` + plage dates |
| Import | `ImportService.importRows()` | `INSERT INTO imports`, `INSERT INTO transactions` (transaction SQL) |
| Template sauvegardé | `ImportTemplateService` | `INSERT/UPDATE import_templates` |

**Pas d'auto-catégorisation à l'import** (parité Comptal2) : les transactions arrivent sans `category_code` ou avec celle du fichier si mappée.

---

## 5. Processus d'édition

Le parcours principal, l'historique et les préférences d'affichage sont isolés : aucune flèche de
retour ne traverse le schéma.

### Chargement et modification

```mermaid
flowchart LR
    F[Filtres UI] --> W[EditionService.buildWhere]
    W --> Q[SELECT paginé]
    Q --> T[TransactionTable]
    T -->|modification| U[EditionService.update]
    U --> L[AutoCategorisationService.learn]
    L --> S[(UPDATE transactions)]
    S --> R[(UPSERT autocat_stats)]
```

### Historique annuler / refaire

```mermaid
flowchart LR
    U[EditionService.update] --> H[useEditionHistory.push]
    H --> Z{Annuler / refaire ?}
    Z -->|Oui| REPLAY[update / restore / remove]
    REPLAY --> REFRESH[Recharger les lignes visibles]
    Z -->|Non| CONTINUE[Continuer l'édition]
```

### Préférences du tableau

```mermaid
flowchart LR
    T[TransactionTable] --> WIDTH[EditionUiService]
    WIDTH --> PREF[edition_ui.json du profil]
```

| Action utilisateur | Service | SQL |
|--------------------|---------|-----|
| Lister / filtrer | `EditionService.list()` | `SELECT … WHERE … ORDER BY … LIMIT/OFFSET` |
| Modifier une ligne | `EditionService.update()` | `UPDATE transactions SET … WHERE id = ?` |
| Apprendre catégorie | `AutoCategorisationService.learn()` | `INSERT OR REPLACE autocat_stats` |
| Suggérer catégories | `AutoCategorisationService.suggest()` | Lecture `autocat_stats` en mémoire |
| Appliquer suggestions | `EditionService.applyCategories()` | Batch `UPDATE` |
| Insérer ligne | `EditionService.insert()` | `INSERT INTO transactions` |
| Supprimer | `EditionService.remove()` / `deleteIds()` | `DELETE FROM transactions` |
| Doublons | `EditionService.findDuplicates()` | `GROUP BY` date+montant+libellé+compte |

---

## 6. Processus d'agrégation (Dashboard & Finance)

Les deux pages consomment **`StatsService`** qui traduit les filtres UI en clauses SQL `WHERE`.

```mermaid
flowchart LR
    UI[Filtres: comptes, catégories, dates, recherche]
    UI --> SF[StatsFilters]
    SF --> SS[StatsService]
    SS --> SQL[(SELECT SUM/GROUP BY)]
    SQL --> CHART[Chart.js]
    SQL --> TABLE[Tableaux Finance intégrés]
    SQL --> SUMMARY[Résumé Dashboard]
```

| Méthode StatsService | Usage | Type de requête |
|----------------------|-------|-----------------|
| `kpis()` | KPI Dashboard/Finance | `SUM`, `COUNT`, `MAX` |
| `categoryTotals()` | Barres dépenses par catégorie | `GROUP BY category_code` |
| `accountBalancesAt()` | Soldes à une date | Somme cumulée |
| `balancesOverPeriod()` | Courbe soldes | CTE / fenêtre temporelle |
| `categoryByPeriod()` | Barres mensuelles | `GROUP BY strftime(period)` |
| `bilanByPeriod()` | Onglet Bilan | Crédits/débits par catégorie |
| `listTransactions()` / `listAllTransactions()` | Export et rapprochements métier | `SELECT` paginé/complet |

**Granularité** : `autoGranularity()` choisit jour/semaine/mois/trimestre/année selon l'amplitude de la plage.

---

## 7. Processus prévisionnel

Les flux de grille, de calcul et de mutation sont séparés ; aucune liaison diagonale ne traverse
ainsi un autre parcours.

### Chargement de la grille

```mermaid
flowchart LR
    P[ProjectService.list/get] --> PS[listSubscriptionTree]
    PS --> GRID[ForecastGrid]
    LAYOUT[widget_layout JSON] --> GRID
```

### Calcul des widgets

```mermaid
flowchart LR
    PS[listSubscriptionTree] --> MODEL[ForecastModel.computeForecast]
    MODEL --> PROJ[ProjectionService]
    PROJ --> WIDGETS[Widgets statistiques et graphiques]
    LAYOUT[widget_layout JSON] --> WIDGETS
```

### Mutation de la grille

```mermaid
flowchart LR
    GRID[ForecastGrid] -->|édition| MUT[add / update / remove / reorder]
    MUT --> DB[(project_subscriptions)]
    DB -->|rechargement| TREE[listSubscriptionTree]
    TREE --> GRID2[Grille actualisée]
```

- La grille transforme l’arbre persisté en lignes éditables.
- Les groupes sont reliés par `parent_id` et ordonnés par `sort_order`.
- `ForecastModel` calcule les occurrences, les soldes et les ventilations en mémoire.
- La configuration des colonnes, widgets, granularité et split est persistée dans `widget_layout`.

## 8. Processus Contacts → Devis → Facture → Paiement

```mermaid
flowchart TD
    CONTACT[Créer/sélectionner un contact] --> QUOTE[Créer un devis numéroté]
    QUOTE --> LINES[Ajouter postes matériel/travail]
    LINES --> TOTALS[Calcul HT + TVA + TTC]
    TOTALS --> SAVEQ[(UPSERT devis)]
    SAVEQ --> DECISION{Décision client}
    DECISION -->|Caduc/refusé| CADUC[Signature de caducité<br/>document conservé]
    DECISION -->|Accepté| INVOICE[Générer une facture rattachée]
    INVOICE --> SAVEI[(UPSERT factures)]
    SAVEI --> MATCH[Recherche transactions créditrices]
    MATCH --> WHY{Numéro dans libellé<br/>ou montant proche ?}
    WHY -->|Oui| LINK[Lier comme paiement]
    WHY -->|Non| MANUAL[Paiement manuel chèque/espèces]
    LINK --> STATUS[Recalcul statut et reste dû]
    MANUAL --> STATUS
```

`InvoiceService` assure les numéros uniques au niveau applicatif et sérialise les dates.
`PaymentTrackingService` classe les correspondances par libellé, montant ou les deux.

## 9. Processus Dons (ex-page Association redistribuée)

Config identité : Paramètres → Organisation. Donateur : Contacts. Journal / émission : `#/dons`.
États figés : Registre.

```mermaid
flowchart TD
    CONFIG[Organisation — config associative] --> DONOR[Contact rôle donateur]
    DONOR --> SOURCE{Origine du don}
    SOURCE -->|Transaction créditrice| MAP[Lier transaction ↔ don]
    SOURCE -->|Saisie| MANUAL[Créer un don manuel]
    MAP --> RECEIPT[Préparer le reçu — page Dons]
    MANUAL --> RECEIPT
    RECEIPT --> NUM[Incrémenter RECU-année-compteur]
    NUM --> PDF[Générer le PDF fiscal]
    PDF --> REGISTER[(Inscrire registre_recus)]
    REGISTER --> CANCEL{Annulation ?}
    CANCEL -->|Oui| MARK[Marquer annule + date<br/>sans supprimer]
```

---

## 10. Processus de migration Comptal2

```mermaid
flowchart LR
    DIR[Dossier profil Comptal2] --> A[MigrationService.analyze]
    A --> UI[DataTab — aperçu]
    UI --> M[MigrationService.migrate]
    M --> SQL[(INSERT accounts, categories, transactions)]
```

| Source Comptal2 | Destination Comptal2.1 |
|-----------------|------------------------|
| `parametre/*.json` | Tables `accounts`, `categories` |
| `data/*.csv` | Table `transactions` + `imports` |
| Clé fragile `Source\|rowIndex\|…` | PK `id` auto-incrémentée |

Lecture via `read_external_*` (chemin absolu choisi par dialog).

---

## 11. Processus d'export

| Export | Service | Destination |
|--------|---------|-------------|
| Transactions CSV (Dashboard) | `ExportService.exportTransactionsCsv()` | Fichier externe via dialog `save` |
| Profil ZIP | `ProfileService.exportZip()` | `zip_dir` → chemin absolu |

---

## 12. Journalisation (logs JSONL)

Tout appel métier important passe par `withLog()` :

| Type fichier | Contenu |
|--------------|---------|
| `*_app.jsonl` | Événements applicatifs |
| `*_error.jsonl` | Erreurs |
| `*_data.jsonl` | Requêtes SQL, opérations données |
| `*_perf.jsonl` | Durées > 100 ms |

Écriture via `tauriBridge.appendTextLine()` → commande Rust `append_text_line`.

---

## 13. Résumé des flux par page

| Page | Lecture | Écriture |
|------|---------|----------|
| Dashboard | `StatsService`, `ConfigService` | `ExportService` (CSV externe) |
| Upload | `FileDetectionService`, `ConfigService`, `ImportTemplateService` | `ImportService` → SQL |
| Édition | `EditionService`, `ConfigService`, `AutoCategorisationService` | `EditionService` → SQL |
| Finance | `StatsService`, `ProjectService`, `ProjectionService` | `ProjectService` (projets) |
| Prévisionnel | `ProjectService`, `ForecastModel`, `ProjectionService` | Prévisions, lignes et layout |
| Contacts | `ClientService`, `ContactGroupService`, `InvoiceService` | Contacts et groupements |
| Facturation | Services contacts, émetteur, postes, documents et transactions | Devis, factures, paiements, pièces jointes |
| Dons | `DonationService`, reçus, config associative | Dons, liens, reçus ; config via Organisation |
| Paramètres | Tous services config | `SettingsService`, `ProfileService`, `ConfigService`, `MigrationService`, `Db` |

---

## 14. Fichiers clés du code

| Fichier | Rôle dans le flux |
|---------|-------------------|
| `src/main.tsx` | Orchestration boot |
| `src/services/db.ts` | Schéma, migrations, accès SQLite |
| `src/services/ProfileService.ts` | Cycle de vie profil + DB |
| `src/services/ImportService.ts` | INSERT import |
| `src/services/EditionService.ts` | CRUD transactions |
| `src/services/StatsService.ts` | Agrégats lecture seule |
| `src/services/ProjectService.ts` | Prévisions et arbre de lignes |
| `src/services/ForecastModel.ts` | Calcul des widgets prévisionnels |
| `src/services/ClientService.ts` | Contacts |
| `src/services/InvoiceService.ts` | Documents de facturation |
| `src/services/PaymentTrackingService.ts` | Rapprochement des paiements |
| `src/services/DonateurService.ts` | Donateurs et liens bancaires |
| `src/services/tauri.ts` | Pont FS / session |
| `src-tauri/src/paths.rs` | Résolution chemins data |
