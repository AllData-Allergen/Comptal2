# Page Dons

**Route canonique** : `#/dons`  
**Alias historique** : `#/association` → redirige vers `#/dons`  
**Fichier** : `src/pages/Association/Association.tsx` (nom de dossier hérité ; la page métier s’appelle **Dons**)

## Redistribution de l’ancienne « page Association »

L’ancienne page unique Association (Comptal2) n’existe plus. Ses responsabilités sont réparties :

| Responsabilité | Page / lieu actuel |
|---|---|
| Identité, éligibilité, signataire, compteur et modèle PDF des reçus | Paramètres → Organisation |
| Fiche donateur (rôle `donateur`) | Contacts (`#/clients`) |
| Journal, rapprochement, corrélations, émission de reçus | **Dons** (`#/dons`) |
| États figés (journal, registre des reçus, état annuel) | Registre (`#/registre`) |

## Rôle de cette page

La page **Dons** centralise le journal des dons, le rapprochement des encaissements bancaires, les
règles de corrélation (catégorie / libellé → contact) et l’émission des reçus fiscaux.
Les donateurs sont des **contacts** portant le rôle `donateur`, pas une entité séparée
dans le flux courant.

Un bandeau rappelle que Comptal **n’établit pas** les comptes annuels associatifs (ANC 2018-06)
et **ne remplace pas** un commissaire aux comptes. L’éligibilité des reçus reste celle de l’organisme.

## Interface

KPI de période : nombre de dons, total, nature/compétences, anonymes, reçus à émettre.

| Onglet | Contenu |
|---|---|
| Dons | Journal unifié (`DonationService.list`) |
| Transactions | Crédits à lier (`listIncomingTransactions` / `linkTransaction`) |
| Corrélations | Règles (`listRules`, `saveRule`, `applyRules`, `linkCategoryToContact`) |
| Reçus | `RegistreRecusPanel` — liste, ouverture PDF, annulation |

Le formulaire `DonationFormModal` crée ou édite un don (manuel ou lié). Les reçus passent
par `ReceiptSignatureModal` puis `AssociationPDFService.generateForDonation` /
`generateForDonations` / `generateForDonorPeriod`.

## Données

| Table | Service |
|---|---|
| `donations` | `DonationService` |
| `donation_rules` | `DonationService` |
| `registre_recus` | `RegistreRecusService` |
| `association_config` | `AssociationConfigService` (lu surtout depuis Organisation ; signature mémorisée ici) |
| `clients` | `ClientService` (rôle donateur) |

Les tables `donateurs` / `dons_manuels` restent pour la migration Comptal2 ; le flux UI
actuel lit `donations`.

`AssociationDemoService.seed()` injecte des données d’exemple.

## Voir aussi

- [Carte Dons](../cartes/dons.md)
- [Page Contacts](./contacts.md)
- [Page Registre](./registre.md)
- [Page Paramètres — Organisation](./parametre.md)
- [Plan 9 — redistribution](../plans/plan-9-gestion-dons-association.md)
