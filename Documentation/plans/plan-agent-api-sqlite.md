# Plan — API agents IA pour Comptal2.1 (SQLite)

## Verdict

**Oui, c’est possible et pertinent.** Comptal2.1 stocke déjà tout le métier dans
`data/profils/{id}/comptal.db` (WAL, 1 connexion côté app). La corrélation
transactions ↔ factures existe déjà côté UI via `PaymentTrackingService`
(libellé contenant le n° de facture + proximité de montant). Il manque une
surface **HTTP locale + MCP** pour que des agents IA y accèdent hors WebView.

## Contraintes structurelles

| Point | Impact API |
|---|---|
| App = Tauri 2 + React, **pas de serveur HTTP métier** aujourd’hui | Ajouter un sidecar local `127.0.0.1` (pas de cloud) |
| 1 fichier SQLite / profil | L’API cible un `profileId` (ou chemin explicite) |
| `factures` / `devis` / `clients` = colonnes + **payload JSON** | L’API doit parser `payload` (dont `paiements[].transactionId`) |
| Lien paiement ↔ TX stocké **dans le JSON facture**, pas une table FK | Écritures via upsert payload (même modèle que l’app) |
| Pool SQL app = 1 connexion + `BEGIN IMMEDIATE` | Sidecar en **lecture seule** par défaut ; écritures contrôlées + `busy_timeout` |
| Données locales / RGPD | Bind `127.0.0.1` uniquement + token Bearer |

## Architecture proposée

```
Agents (Cursor / OpenCode / Claude Desktop)
        │  HTTP REST  ou  MCP stdio
        ▼
Comptal Agent API  (Node, scripts/agent-api/)
        │  node:sqlite  (readonly | readwrite)
        ▼
profils/{id}/comptal.db
```

### Pourquoi un sidecar (et pas du SQL brut dans l’agent)

1. Réutilise la sémantique métier (soft-delete, payloads, scoring de match).
2. Évite que l’agent exécute du SQL destructeur.
3. Expose des outils MCP stables (`list_unpaid_invoices`, `suggest_matches`, `link_payment`).

### Phases

**Phase 1 (cette branche) — lecture + corrélation + lien paiement**

- Serveur HTTP `127.0.0.1:17841` (configurable)
- Auth `Bearer` (`COMPTAL_AGENT_TOKEN`, défaut local)
- Endpoints :
  - `GET /health`
  - `GET /profiles`
  - `GET /profiles/:id/transactions`
  - `GET /profiles/:id/clients`
  - `GET /profiles/:id/devis`
  - `GET /profiles/:id/factures`
  - `GET /profiles/:id/factures/:factureId/matches` (heuristique = PaymentTrackingService)
  - `POST /profiles/:id/factures/:factureId/link` `{ transactionId }` (écriture opt-in)
  - `GET /openapi.json`
- Mode `COMPTAL_AGENT_READONLY=1` par défaut pour les écritures bloquées sauf override
- Script npm `agent-api:start`
- Doc d’usage dans ce plan

**Phase 2 — MCP Cursor**

- Serveur MCP stdio `scripts/agent-api/mcp-server.mjs` qui appelle l’API HTTP locale
- Script npm `agent-api:mcp` (pas de dépendance npm supplémentaire)
- Outils : `comptal_health`, `comptal_list_profiles`, `comptal_list_transactions`,
  `comptal_list_factures`, `comptal_list_devis`, `comptal_list_clients`,
  `comptal_suggest_matches`, `comptal_link_payment` (uniquement si `COMPTAL_AGENT_READONLY=0`)

#### Démarrage

1. Lancer le sidecar HTTP (dans le dépôt Comptal2) :

   ```powershell
   cd C:\Users\Leopa\Documents\Comptal2
   $env:COMPTAL_AGENT_TOKEN = "votre-token-secret"
   npm run agent-api:start
   ```

2. Configurer Cursor pour lancer le MCP (stdio) — exemple `C:\Users\Leopa\.cursor\mcp.json` :

   ```json
   {
     "mcpServers": {
       "comptal-agent": {
         "command": "node",
         "args": [
           "C:\\Users\\Leopa\\Documents\\Comptal2\\scripts\\agent-api\\mcp-server.mjs"
         ],
         "env": {
           "COMPTAL_AGENT_URL": "http://127.0.0.1:17841",
           "COMPTAL_AGENT_TOKEN": "votre-token-secret",
           "COMPTAL_AGENT_READONLY": "1"
         }
       }
     }
   }
   ```

   Variables utiles :

   | Variable | Rôle |
   |---|---|
   | `COMPTAL_AGENT_URL` | Base HTTP (prioritaire sur port seul) |
   | `COMPTAL_AGENT_PORT` | Port si URL non définie (défaut `17841`) |
   | `COMPTAL_AGENT_TOKEN` | Doit correspondre au token du serveur HTTP |
   | `COMPTAL_AGENT_READONLY` | `1` = pas d’outil `comptal_link_payment` ; `0` = écritures autorisées côté API |

3. Redémarrer Cursor (ou recharger les serveurs MCP). Vérifier que `comptal_health` répond
   lorsque le sidecar tourne.

Test manuel rapide (PowerShell, serveur déjà lancé) :

```powershell
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' | npm run agent-api:mcp --silent
```

**Phase 3 — Intégration app (optionnel)**

- Toggle Paramètres « API agents » qui démarre/arrête le sidecar depuis Tauri
- Affiche le token + le port
- Checkpoint WAL avant écritures agent

**Phase 4 — Corrélation enrichie**

- Suggestions multi-critères (client, date ±N jours, montant partiel)
- Endpoint batch `POST .../auto-link` (label only, comme `autoLinkLabelMatches`)
- Dons : réutiliser `DonationService` / `donation_rules`

## Sécurité

- Écoute **uniquement** `127.0.0.1`
- Token obligatoire
- Pas d’endpoint SQL libre
- Écritures limitées au lien paiement (pas de delete massif)
- Logs JSONL optionnels sous `data/logs/` (sans IBAN / PII complète)

## Fichiers clés existants à réutiliser

- `src/services/db.ts` — schéma / migrations
- `src/services/PaymentTrackingService.ts` — scoring label/montant
- `src/services/InvoiceService.ts` — serialize/deserialize payloads
- `Documentation/schema-sqlite.md`

## Critères d’acceptation Phase 1

1. `GET /health` → 200
2. Liste profils depuis `COMPTAL_DATA_ROOT` (défaut `./data`)
3. Liste factures impayées + suggestions de TX pour une facture de démo
4. `POST .../link` en mode readwrite lie `transactionId` dans `paiements` et met à jour le statut
5. Aucune dépendance native (utilise `node:sqlite` Node 22+)
