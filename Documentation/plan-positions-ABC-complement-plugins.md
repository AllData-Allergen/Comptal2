# Plan d’exécution — Positions A / B / C (complément + plugins)

**Date :** 6 septembre 2026  
**Produit :** Comptal2.1 (Tauri 2 + React + SQLite)  
**Document source :** `plan-officialisation-logiciel-comptabilite.md` § 4  
**Statut :** plan d’exécution produit (pas un avis juridique)

---

## 0. Décision de positionnement (réconciliation A / B / C)

Les analyses de conformité (sept. 2026) et le document d’officialisation sont clairs : Comptal **n’est pas** une comptabilité PCG, **n’exporte pas de FEC**, **n’est pas** une caisse NF 525, **n’est pas** une plateforme agréée.

**Positionnement produit demandé (à coller sur A / B / C) :**

| Cible | Rôle de Comptal |
|---|---|
| Comptabilité **familiale** | Suivi de trésorerie locale (comptes, imports, catégories) |
| **TPE** | Trésorerie + **facturation** (mentions, gel, numérotation) |
| **Association** | Trésorerie + dons / reçus fiscaux (Cerfa) — l’asso reste responsable de l’éligibilité |
| **Open source** | Logiciel libre local, adaptable par **import de mods JSON** |
| **Complément** des gros logiciels | Export CSV structuré pour expert-comptable / Sage / Cegid / Quadra — **jamais nommé FEC** |
| **Plugins / mods** | Packs déclaratifs (catégories, mentions, mappeurs CSV) — pas d’exécution de code natif |

**Réconciliation avec le § 4 du plan d’officialisation :**

| Position du document | Lecture pour Comptal | Cette session |
|---|---|---|
| **A** — Trésorerie + asso | Socle : hors champ caisse, hors PA, hors FEC, mentions facture si le module est proposé, RGPD local, reçus = modèle Cerfa | **P0 — livrer** |
| **B** — Facturation TPE (B2B) | En plus de A : mentions facture (dont 293 B, pénalités, 40 €, escompte), gel / avoir, snapshot vendeur. Factur-X / PA = plus tard | **P0 mentions + gel + numérotation.** Factur-X / PA = **P1** |
| **C** — Comptabilité informatisée (FEC) | **Ne pas** devenir C. Valider C en **refus explicite** : pas d’écritures PCG, pas de FEC, pas de « logiciel de comptabilité certifié ». L’interop = export trésorerie pour le logiciel qui, lui, tient le FEC | **P0 — disclaimer + export complément.** FEC / journaux / NF 203 = **hors scope (P1+)** |

**Ce que l’on n’écrit jamais (UI, PDF, README) :** certifié / agréé / homologué DGFiP, NF 525, NF 203, plateforme agréée, FEC Comptal, comptes annuels ANC / PCG.

**Formulation honnête unique :**

> Comptal est un logiciel libre de **gestion de trésorerie**, de **facturation** et de **dons associatifs**, pour un usage local (famille, TPE, association). Il est **complémentaire** d’un logiciel de comptabilité (Sage, Cegid, Quadra, cabinet) et d’une **plateforme agréée** pour la facturation électronique. Il n’est ni une plateforme agréée, ni un logiciel de caisse, ni un substitut à un expert-comptable.

Une seule application, **trois modes d’usage** (réglage par profil) : Familiale / TPE / Association.

---

## 1. Socle commun (toutes positions)

### Exigences

| Id | Type | Exigence |
|---|---|---|
| S1 | Produit | Page À propos + premier lancement : périmètre, non-qualité, hors champ caisse / PA / FEC |
| S2 | Produit | Mode d’usage par profil → menus + disclaimers (pas 3 apps) |
| S3 | Légal | Conservation 10 ans (CGI / LPF) : warning fort sur les suppressions ; soft-delete des transactions |
| S4 | RGPD | Notice in-app : utilisateur = responsable de traitement ; ZIP en clair ; updater GitHub |
| S5 | Interop | Export expert-comptable CSV (pas FEC) + contrat de format pour mods |
| S6 | Extensibilité | Import ZIP de mods JSON déclaratifs, sans `eval` / natif |

### Fichiers concernés (socle)

- `src/types/settings.ts`, `src/types/models.ts`, `src/types/plugin.ts`
- `src/utils/usageMode.ts`, `src/utils/sqlTx.ts`
- `src/services/SettingsService.ts`, `ProfileService.ts`, `db.ts`, `PluginService.ts`, `ExportService.ts`, `EditionService.ts`
- `src/components/Parametre/AboutTab.tsx`, `GeneralTab.tsx`, `ProfilesTab.tsx`, `DataTab.tsx`, `PluginsTab.tsx`
- `src/components/Common/ScopeDisclaimerModal.tsx`
- `src/i18n/locales/fr.json`, `en.json`, `de.json`
- `src/App.tsx`, `src/pages/Parametre/Parametre.tsx`
- Règle `.cursor/rules/comptal21-structure-dossiers.mdc` (`data/plugins/`)

---

## 2. Position A — Trésorerie + association (hors champ)

### Exigences à couvrir

| Id | Type | Contenu |
|---|---|---|
| A1 | Légal | Ne pas se présenter comme tenant la comptabilité informatisée / FEC |
| A2 | Légal | Hors champ CGI 286 (pas de caisse extra-comptable B2C) |
| A3 | Produit | Lettrage facture ↔ banque OK ; espèces/chèque → **écriture de trésorerie automatique** (pas un TPV) |
| A4 | RGPD | Responsable = utilisateur ; notice Données / confidentialité |
| A5 | Asso | Reçus = modèle ; éligibilité = l’asso ; pas ANC 2018-06 |
| A6 | Conservation | 10 ans + CGI 1734 sur les modales destructives |

### Éléments à modifier

- About / disclaimer / modes d’usage
- `PaymentTrackingService` + `PaiementFactureModal` (écriture auto)
- `AssociationPDFService` (RGPD + conservation)
- `pages/Association/Association.tsx` — page **Dons** (`#/dons`), disclaimer ANC
- Confirmations Data / Profils / Comptes / Édition / Registre
- Soft-delete `transactions.deleted_at`

### Lots

- **W1** (P0) positionnement + modes
- **W3** (P0) conservation + RGPD
- **W5** (P0 allégé) asso
- Paiements A3 traités dans **W2** (même code facture)

---

## 3. Position B — Facturation TPE (sans devenir PA)

### Exigences à couvrir

| Id | Type | Contenu |
|---|---|---|
| B1 | Légal | PDF : adresse client, SIREN/SIRET client si entreprise, TVA par taux |
| B2 | Légal | Pénalités B2B + 40 € + escompte (même « néant ») ; 293 B auto si franchise |
| B3 | Légal | Série facture **chronologique continue** via `prefixeFacture` (plus `FAC-DEVIS-…`) |
| B4 | Légal | Facture émise = lecture seule ; correction = **avoir** (nouveau n°) |
| B5 | Légal | PDF depuis **snapshot vendeur** figé à l’émission |
| B6 | Caisse | Espèces/chèque → transaction bancaire auto (libellé « suivi, pas une caisse ») |
| B7 | P1 | Factur-X / UBL, 4 mentions réforme e-invoicing, raccord PA |

### Éléments à modifier

- `InvoiceService.ts` (numérotation, gel, `createAvoir`)
- `types/invoice.ts` (`isAvoir`, `factureOrigine`, snapshot vendeur étendu)
- `DocumentEditor.tsx`, `GestionFactureRow.tsx`, `FactureModal.tsx`
- `PDFService.ts` + helper mentions
- `PaymentTrackingService.ts`

### Lots

- **W2** (P0) tout B1–B6
- B7 documenté **P1**

---

## 4. Position C — Comptabilité informatisée (FEC) : **refus explicite**

### Exigences à couvrir (cette session)

| Id | Type | Contenu |
|---|---|---|
| C1 | Produit | UI : « Comptal ne produit pas de FEC et ne tient pas de journaux PCG » |
| C2 | Interop | Export trésorerie pour **alimenter** le logiciel qui, lui, fait le FEC |
| C3 | Docs | C n’est **pas** le métier Comptal ; chantier FEC = 18–36 mois si un jour on pivote |

### Ce qui reste P1 / hors scope

- Plan de comptes, journaux, `EcritureNum`, `ValidDate`, clôture, RAN
- Export FEC 18 champs, Test Compta Demat
- Intangibilité type ISCA / NF 203
- SQLCipher

**Valider C** = le produit **assume** de ne pas être C, et **oriente** vers l’expert-comptable / Sage / Cegid.

---

## 5. Lots de travail

### W1 — Positionnement honnête + modes d’usage — **P0**

- `ProfileInfo.usageMode` : `familiale` \| `tpe` \| `association`
- Presets menus : familiale (pas facturation / dons / **registre**), TPE (pas dons), asso (tout)
- Application du preset à la création, au changement de mode, à l’activation du profil
- À propos : texte vérité + notice données
- Modal premier lancement (`scopeAcknowledged` dans `settings.json`)
- i18n fr / en / de

### W2 — Facturation TPE — **P0**

- `buildNextNumero('facture')` = `{PREFIX}-{YEAR}-{SEQ}` avec `prefixeFacture`
- `upsertFacture` : après émission, immuable sauf paiements / pièce jointe / statut de paiement
- `createAvoir` : nouveau n°, totaux inversés, référence facture d’origine
- Snapshot vendeur (identité, régime TVA, mentions, IBAN, logo)
- PDF : client (adresse + SIREN/SIRET), TVA par taux, mentions auto
- Espèces/chèque → `EditionService.insert` sur le compte lié (ou 1er compte)

### W3 — Conservation 10 ans + RGPD — **P0**

- Notice Données / confidentialité (À propos)
- Reçus : droit d’effacement **limité** par obligation légale (reçus fiscaux / 10 ans)
- Modales destructives : 10 ans / CGI 1734
- Soft-delete `transactions.deleted_at` (filtre listes / stats / export) ; pas SQLCipher

### W4 — Interop complément — **P0** (cœur) / mappeurs Sage **P1**

- CSV : Date, Compte, Libellé, Débit, Crédit, Catégorie, N° facture liée
- Fichier nommé `comptal_tresorerie_…` — **jamais FEC**
- Contrat de colonnes pour mods `export_mapper` (Documentation)
- Bouton Dashboard + onglet Données

### W5 — Dons (domaine associatif) — **P0 allégé**

- Devis caduc / reçus annulés : déjà en place — conserver + mention conservation
- Disclaimer ANC 2018-06 / CAC sur la page Dons
- RGPD reçus corrigé

### W6 — Plugins / mods MVP — **P0**

- Dossier global `data/plugins/{id}/` + activation **par profil** (`plugin_state`)
- ZIP + `manifest.json` (`id`, `name`, `version`, `type`, `hooks`)
- Types : `category_pack`, `mention_pack`, `export_mapper`, `import_mapper`
- UI Paramètre → Plugins : liste, activer, importer, supprimer
- Sécurité : JSON seulement ; pas de `.js` / binaire ; pas d’`eval`
- ZIP déjà géré par Tauri (`unzip_to`) — **pas de nouvelle dépendance**

### W7 — Vérification — **P0 fin de parcours**

- Grille A/B/C : implémenté / partiel / manquant (voir § 9)
- Typecheck renderer : `npx tsc -p tsconfig.json --noEmit` (Comptal2.1 n’a **pas** de `tsconfig.electron.json` — ce fichier appartient à Comptal2 Electron)
- Lints des fichiers touchés
- **Pas** `npm run build` / electron-builder

### W8 — Documentation — **P0**

- Mettre à jour `plan-officialisation-logiciel-comptabilite.md`
- Ce fichier + `format-export-expert-comptable.md` + `plugins-mods.md`
- Exemple de mod dans `Documentation/exemples-plugins/`

---

## 6. P0 vs P1

| P0 (cette session) | P1 (documenté seulement) |
|---|---|
| W1–W6 MVP + W7 + W8 | Factur-X / UBL / CII |
| Soft-delete transactions | SQLCipher, archivage chiffré |
| Export CSV trésorerie | Connecteurs Sage/Cegid/Quadra natifs (via mods plus riches) |
| Avoir + gel facture | Exercice / clôture / FEC |
| Plugins JSON | Scripts JS sandboxed, code natif |
| Licence AGPL affichée comme intention | Fichier `LICENSE` racine + CLA + marque INPI |
| | 4 mentions réforme e-invoicing selon date d’émission |
| | Pont API plateforme agréée |
| | NF 525 / NF 203 / devenir PA — **jamais** sans pivot budget |

---

## 7. Comportement utilisateur (après P0)

1. Premier lancement : modal « Ce que Comptal est / n’est pas » → j’ai compris.
2. Création / fiche profil : choisir Familiale, TPE ou Association → les menus s’adaptent.
3. Paramètre → À propos : positionnement, notice données, mises à jour GitHub.
4. TPE : factures numérotées `FAC-2026-0001`… ; une fois émise, lecture seule ; bouton Avoir.
5. PDF facture : identité figée, client + SIREN, TVA par taux, mentions légales.
6. Paiement espèces/chèque : une ligne apparaît dans Édition (crédit), ce n’est pas une caisse.
7. Export « expert-comptable » : CSV à remettre au cabinet — pas un FEC.
8. Dons : bandeau « ne remplace pas les comptes ANC 2018-06 » ; reçus conservés si annulés.
9. Paramètre → Plugins : importer un ZIP de mod, activer, appliquer un pack de catégories / mentions / mapping.

---

## 8. Risques et garde-fous

- **Double numérotation historique** `FAC-DEVIS-…` : les anciens numéros restent ; les **nouveaux** suivent `prefixeFacture`.
- Soft-delete : Ctrl+Z Édition continue de fonctionner (`restore` enlève `deleted_at`).
- Plugins malveillants : refus de tout fichier hors JSON/texte ; pas d’exécution.
- Menu global (`settings.json`) : le preset du profil **écrase** la visibilité au changement de mode / d’activation — l’utilisateur peut recaler dans Général ensuite.

---

## 9. Bilan de vérification (6 septembre 2026)

### Typecheck / lints

| Contrôle | Résultat |
|---|---|
| Lints fichiers touchés | Aucun diagnostic |
| `npx tsc -p tsconfig.json --noEmit` | Erreurs **préexistantes** pdfmake (`PDFService` / `AssociationPDFService` / `RegisterPDFService` : `getBuffer` / `Content`). **Aucune** erreur nouvelle sur Invoice / Plugin / Export / db v15 après correction W7 (`markDevisCaduc` cassé, `i18n` manquant dans `PluginService`, `mapper.columnRoles`) |
| `tsconfig.electron.json` | **Absent** de Comptal2.1 (stack Tauri, pas Electron) |
| `npm run build` / electron-builder | Non lancé (règle projet) |
| UI Tauri bout-en-bout | Non exercée dans cette session (app desktop) |

### Grille positions A / B / C (P0)

| Id | Exigence | Statut |
|---|---|---|
| S1 / A1 / C1 | Disclaimer À propos + premier lancement (pas FEC, pas caisse, pas PA) | **Implémenté** |
| S2 | Modes Familiale / TPE / Association (menus) | **Implémenté** |
| S3 / A6 | Warnings 10 ans / CGI 1734 + soft-delete transactions | **Implémenté** (comptes : `DELETE` SQL cascade — **partiel**, warning UI seulement) |
| S4 / A4 | Notice RGPD in-app | **Implémenté** |
| S5 / C2 | Export CSV trésorerie (jamais nommé FEC) | **Implémenté** (CSV ; Excel dédié = **P1**) |
| S6 | Plugins JSON ZIP | **Implémenté** |
| A2 / B6 | Espèces/chèque → écriture trésorerie auto | **Implémenté** |
| A5 / W5 | Disclaimer ANC 2018-06 / CAC ; reçus caducs | **Implémenté** |
| B1–B2 | PDF client + SIREN/SIRET, TVA par taux, 293 B, pénalités, 40 €, escompte | **Implémenté** |
| B3 | Série `{prefixeFacture}-{YEAR}-{SEQ}` | **Implémenté** (anciens `FAC-DEVIS-…` conservés) |
| B4 | Facture émise lecture seule ; avoir | **Implémenté** (UI lockée ; `upsertFacture` fusionne paiements/PJ si le cœur est modifié) |
| B5 | PDF depuis snapshot vendeur | **Implémenté** (facture sans `vendeur` : repli sur l’émetteur courant) |
| B7 / C3 | Factur-X, PA, FEC, NF 203 | **P1 / hors scope** — C **refusée** |

### Trous P0 corrigés en W7

- `InvoiceService.markDevisCaduc` : signature cassée après `createAvoir` → réparée
- `PluginService` : import `i18n` ; `applyImportMapper` utilisait `roles` inexistant → `mapper.columnRoles`
- PDF snapshot : `||` fuyait vers l’émetteur courant si champ vide → `??` ; facture sans snapshot ne plante plus

