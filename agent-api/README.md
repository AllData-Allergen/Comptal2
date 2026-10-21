# Comptal2.1 — API pour agents IA

API HTTP **locale** (127.0.0.1 uniquement) qui permet à des agents IA de lire et
écrire dans une base Comptal2.1 (profil SQLite), avec :

- **Authentification par jeton** : `Authorization: Bearer $COMPTAL_AGENT_TOKEN`
  exigée sur toutes les routes sauf `GET /health` (401 sinon).
- **dry_run** : toute écriture accepte `?dry_run=true` (ou champ `dry_run: true`)
  et renvoie le diff prévu **sans rien écrire**.
- **Journal d'audit append-only** : table `audit_log` (qui, quoi, avant/après),
  écrite dans la même transaction que l'écriture ; protégée par triggers
  (UPDATE/DELETE interdits) ; lisible via `GET /audit`.
- **Spec OpenAPI** : [`openapi.yaml`](./openapi.yaml) (versionnée dans le repo).

## Démarrage

Prérequis : Node.js >= 24 (exécution TypeScript native, `node:sqlite`).

```powershell
# 1. Générer un jeton (hors du dépôt, jamais commité)
$token = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })

# 2. Pointer sur la base du profil (ex. profil de développement)
$env:COMPTAL_AGENT_TOKEN = $token
$env:COMPTAL_DB_PATH = "C:\chemin\vers\profil\comptal.db"
$env:COMPTAL_AGENT_PORT = "7421"   # optionnel (défaut 7421)

# 3. Lancer
cd agent-api
npm start
```

Le serveur refuse de démarrer sans `COMPTAL_AGENT_TOKEN` (16+ caractères) ni
`COMPTAL_DB_PATH` : pas de jeton, pas d'API.

## Exemples

```powershell
$h = @{ Authorization = "Bearer $env:COMPTAL_AGENT_TOKEN" }

# Ping (sans auth)
Invoke-RestMethod http://127.0.0.1:7421/health

# Version (avec auth)
Invoke-RestMethod http://127.0.0.1:7421/version -Headers $h

# Sans jeton -> 401
Invoke-RestMethod http://127.0.0.1:7421/version   # doit échouer
```

## Routes (v1)

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | Ping applicatif (sans auth) |
| GET | `/version` | Version + capacités |
| GET | `/transactions` | Liste (`account_id`, `include_deleted`, `limit`, `offset`) |
| POST | `/transactions` | Créer (`value_date` défaut = `date`) |
| GET/PATCH/DELETE | `/transactions/{id}` | Lire / modifier partiel / **soft delete** |
| GET | `/export/transactions` | Export CSV (aligné ExportService, colonnes `Date;Compte;Libellé;Débit;Crédit;Catégorie;N° facture`) |
| POST | `/imports/transactions` | Import CSV (`account_id`, `csv` ≤ 5 Mo, `mapping` = indices de colonnes ; dates FR/ISO/série Excel, montants FR/EN, `debitCredit` = colonne unique signée) |
| GET/POST | `/import-templates` | Templates d'import (en-têtes → rôles : `date`, `dateValue`, `libelle`, `debit`, `credit`, `debitCredit`, `balance`, `ignore`) |
| GET | `/accounts` | Liste |
| POST | `/accounts` | Créer (`code` unique) |
| GET/PATCH | `/accounts/{id}` | Lire / modifier partiel |
| DELETE | `/accounts/{id}` | **DELETE dur** (cascade) — exige `?confirm=true` |
| GET | `/categories` | Liste |
| POST | `/categories` | Créer (code en majuscules, `X` refusé) |
| GET/PATCH | `/categories/{id}` | Lire / modifier (changement de code répercuté) |
| DELETE | `/categories/{id}` | Supprimer (transactions → `NULL`, purge autocat) |
| GET | `/audit` | Journal d'audit (lecture seule, `limit`, `offset`) |
| GET | `/category-groups` | Regroupements de catégories |
| GET | `/category-groups/{id}` | Détail d'un regroupement |
| POST | `/category-groups` | Créer un regroupement (`name` requis, `sort_order` auto) |
| PATCH | `/category-groups/{id}` | Modifier un regroupement (fusion) |
| DELETE | `/category-groups/{id}` | Supprimer (categories.group_id → NULL) |
| GET | `/balances` | Nets par compte et par catégorie (aligné ConfigService) |
| GET | `/devis` | Liste des devis (`limit`, `offset`) |
| GET | `/devis/{id}` | Détail d'un devis (payload complet) |
| POST | `/devis` | Créer un devis (totaux recalculés, `numero` unique) |
| PATCH | `/devis/{id}` | Modifier un devis (fusion payload, champs gelés après émission) |
| GET | `/factures` | Liste des factures (`limit`, `offset`) |
| GET | `/factures/{id}` | Détail d'une facture (payload complet) |
| POST | `/factures` | Créer une facture (`devisOrigine` vérifié, totaux recalculés) |
| PATCH | `/factures/{id}` | Modifier une facture (fusion payload, champs gelés après émission) |
| GET | `/factures/{id}/payment-status` | Statut de paiement (`paidAmount`, `remaining`, `statut_calcule`) |
| GET | `/factures/{id}/paiements/matches` | Transactions candidates (libellé contenant le n° et/ou montant) |
| POST | `/factures/{id}/paiements/link` | Lier une transaction (`transaction_id`) comme paiement — idempotent |
| POST | `/factures/{id}/paiements/auto-link` | Lier auto les transactions dont le libellé contient le n° |
| POST | `/factures/{id}/paiements` | Paiement manuel espèces/chèque + transaction de trésorerie |
| DELETE | `/factures/{id}/paiements/{paiementId}` | Retirer un paiement — exige `confirm=true`, statut recalculé |
| GET | `/contacts` | Liste des contacts (`include_archived`, `group`, `q`, `limit`, `offset`) |
| POST | `/contacts` | Créer un contact (`codeClient` généré si absent) |
| GET/PATCH | `/contacts/{id}` | Lire / modifier un contact (payload JSON) |
| DELETE | `/contacts/{id}` | **DELETE dur** — exige `confirm=true`, 409 si devis/factures/dons liés |
| GET | `/contact-groups` | Groupements de contacts |
| POST | `/contact-groups` | Créer un groupement (`nom` requis) |
| PATCH | `/contact-groups/{id}` | Modifier un groupement (fusion) |
| DELETE | `/contact-groups/{id}` | Supprimer (clients.groupeId → NULL) |
| GET | `/dons` | Liste des dons manuels (`donateur_id`, `limit`, `offset`) |
| POST | `/dons` | Créer un don (`donateurId` requis ou `ANONYME`) |

Toute écriture (POST/PATCH/DELETE) accepte `?dry_run=true` (ou `dry_run: true`
dans le corps) et renvoie alors `{dry_run, action, entity, entity_id, before,
after}` **sans rien écrire**. Un `dry_run` non booléen → 422.

Codes d'erreur : `400` (confirm manquant), `401` (jeton), `404` (introuvable),
`409` (unicité / ressource protégée), `422` (validation, y compris **champ
inconnu** dans le corps d'une transaction — la liste blanche est
`account_id`, `date`, `value_date`, `debit`, `credit`, `label`,
`category_code`, `dry_run`).

## Convention de signe des montants (transactions)

Alignée sur l'app Comptal2.1 (`ImportService`) :

- **Dépense** : `debit` **négatif** (ex. `-12.50`). Un `debit` **positif** saisi
  (sens naturel « montant de la dépense ») est **normalisé en négatif** à
  l'écriture (POST et PATCH) — la réponse renvoie la valeur stockée.
- **Revenu** : `credit` **positif** (ex. `1500`). Un `credit` négatif saisi est
  normalisé en positif.
- **Mouvement unique** : exactement un des deux champs non nul (422 sinon).
- `GET /balances` et `GET /stats/kpis` lisent ces valeurs telles quelles :
  une dépense de 12.50 donne `expenses: 12.5`, `net: -12.5` et un solde
  de compte diminué de 12.50.

```powershell
# Créer une dépense de 12.50 (debit positif accepté, stocké -12.5)
Invoke-RestMethod http://127.0.0.1:7421/transactions -Method Post -Headers $h `
  -ContentType 'application/json' `
  -Body '{"account_id":1,"date":"2026-10-15","debit":12.5,"label":"Courses","category_code":"ALIM"}'
```

## Facturation (devis / factures)

Les devis et factures sont stockés comme dans l'app : un **payload JSON**
(format camelCase de `Comptal2.1/src/types/invoice.ts`) dans les tables
`devis` / `factures`. L'API accepte le corps POST au format de l'app pour que
les documents créés par l'agent restent lisibles dans l'app.

- Totaux **recalculés et écrasés** (`totalHT`, `totalTVA`, `totalTTC`) via les
  mêmes formules qu'`InvoiceService` (marge, remise, frais transport/déplacement).
- `numero` unique vérifié à la création (422 si déjà utilisé).
- `devisOrigine` d'une facture doit référencer un devis existant (422 sinon).
- Statuts devis : `brouillon`, `envoye`, `accepte`, `refuse`, `expire`, `caduc`.
- Statuts facture : `brouillon`, `envoyee`, `payee_partiellement`, `payee`,
  `en_retard`, `annulee`. Défaut : `brouillon`.

## Serveur MCP (stdio)

Un serveur MCP (Model Context Protocol) sur **stdin/stdout** expose les mêmes
opérations que l'API HTTP sous forme d'outils `comptal_*` (61 outils), pour les
clients MCP (Claude Desktop, etc.).

```powershell
# Mêmes variables d'environnement que le serveur HTTP
$env:COMPTAL_AGENT_TOKEN = $token
$env:COMPTAL_DB_PATH = "C:\chemin\vers\profil\comptal.db"

node src/mcp.ts
```

- **Protocole** : JSON-RPC 2.0 sur stdio (une requête par ligne) ; méthodes
  `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
- **Authentification** : le jeton est passé dans `params._meta.token`
  (ou `params._meta["comptal.token"]` / `params.token`) ; `initialize` et
  `tools/list` sont libres, tout `tools/call` l'exige (erreur `-32001` sinon).
- **Erreurs métier** : renvoyées comme résultat MCP avec `isError: true`
  (pas des erreurs JSON-RPC) ; codes JSON-RPC standards pour le protocole
  (`-32700`, `-32601`, `-32602`, `-32603`).
- **Audit** : chaque écriture est journalisée avec `actor: "mcp"`.
- `dry_run` supporté comme sur l'API HTTP (champ `dry_run` des arguments).

## Sécurité

- Écoute sur `127.0.0.1` uniquement — jamais `0.0.0.0`.
- Le jeton vit dans l'environnement (ou un fichier hors dépôt), jamais dans le code.
- `DELETE /accounts/:id` (cascade transactions) exige `?confirm=true`.
- La catégorie `X` (transferts inter-comptes) est protégée (création/codage/suppression).
- `audit_log` est append-only : triggers SQL qui rejettent tout UPDATE/DELETE.

## Tests

```powershell
cd agent-api
npm test
```

Les tests créent leur propre base SQLite **de test** dans un dossier temporaire ;
ils ne touchent jamais les vraies données (`data/`, AppData).
