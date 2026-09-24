# Page Registre

**Route** : `#/registre`  
**Fichier** : `src/pages/Register/Register.tsx`  
**Carte** : [cartes/registre.md](../cartes/registre.md)

---

## 1. Rôle

Le Registre produit des documents de référence persistés par profil : instantané d’une période,
éléments libres, liens, pièces jointes et PDF. Il est distinct du registre des reçus fiscaux
(`registre_recus`), géré depuis la page Dons.

Les types générables se masquent ou s’affichent depuis le launcher de la page et depuis
Paramètres → Organisation → Registres. Au moins un type doit rester actif.

---

## 2. Structure de l’interface

```
┌─────────────────────────┬──────────────────────────────────────────┐
│  Launcher               │  Document sélectionné                    │
│  ├── Types activés      │  ├── Métadonnées + PDF                   │
│  ├── Formulaire         │  ├── Éléments libres                     │
│  │   type / titre       │  ├── Liens / références                  │
│  │   période / notes    │  └── Pièces jointes                      │
│  └── Générer            │                                          │
│  Liste des documents    │                                          │
│  (tous / asso / général)│                                          │
└─────────────────────────┴──────────────────────────────────────────┘
```

---

## 3. Types de documents

| Type | Famille | Contenu de l’instantané |
|---|---|---|
| `reference` | Général | Document libre (éléments et liens saisis) |
| `invoice_summary` | Général | Factures de la période, totaux facturé / encaissé |
| `cashflow_summary` | Général | Flux débit/crédit des transactions |
| `donation_journal` | Association | Journal des dons |
| `tax_receipt_register` | Association | Registre des reçus fiscaux |
| `annual_donation_statement` | Association | État annuel des dons (déclaration 222 bis) |

---

## 4. Cycle de vie

1. `RegisterService.loadSettings()` et `enabledTypes()` — types visibles.
2. `listDocuments()` + `listRegisterAttachments()` — liste et pièces globales.
3. `generate({ type, title, periodStart, periodEnd, notes })` — crée l’instantané et incrémente le numéro.
4. `RegisterPDFService.generate()` puis `setPdfPath()` — PDF dans les pièces jointes du profil.
5. Enrichissement optionnel : `addItem`, `addLink`, `addAttachment`.
6. `openDocumentPdf` / régénération PDF / `deleteDocument`.

La numérotation suit `numberFormat` (ex. `{PREFIX}-{YEAR}-{SEQ:4}`).

---

## 5. Voir aussi

- [Carte Registre](../cartes/registre.md)
- [Page Dons](./dons.md) — émission des reçus fiscaux
- [Page Paramètres](./parametre.md) — panneau Registres et PDF
