# Carte — Page Dons

> Référence rapide : fonctions, services et composants de `#/dons`.
> L’ancienne page Association a été redistribuée (Organisation, Contacts, Dons, Registre) ;
> ce fichier documente uniquement la page métier **Dons**.

---

## Identité

| Champ | Valeur |
|-------|--------|
| Route | `/dons` (alias `/association` → redirection) |
| Fichier page | `src/pages/Association/Association.tsx` |
| Onglets | `dons` \| `transactions` \| `rules` \| `recus` |

---

## Arborescence des fonctions

```
Association.tsx  (page UI « Dons »)
├── Fonctions internes
│   ├── load()
│   ├── seedExamples()
│   ├── donorName / filteredDonations / periodDonors
│   ├── linkCategory / link
│   ├── toggleSelected / toggleAllPending
│   ├── rememberSignature
│   ├── emitReceipt / requestSelectedReceipts / requestPeriodReceipt
│   ├── emitSignedReceipts
│   ├── openReceipt
│   └── applyRules
├── Composants
│   ├── DonationFormModal
│   ├── ReceiptSignatureModal
│   ├── RegistreRecusPanel
│   └── WideModal
├── Services
│   ├── DonationService.list / listDonors / listIncomingTransactions / listRules
│   ├── DonationService.save / linkTransaction / linkCategoryToContact
│   ├── DonationService.applyRules / saveRule / deleteRule / summary
│   ├── AssociationPDFService.generateForDonation / generateForDonations / generateForDonorPeriod
│   ├── AssociationConfigService.getOrCreateConfig / saveConfig
│   ├── AssociationDemoService.seed
│   ├── ClientService.getClientById
│   ├── ConfigService.listCategories
│   ├── RegistreRecusService.getById
│   └── AttachmentService.openRel
└── Utils
    └── invoiceFormat.clientDisplayName / formatMoney
```

`DonateursPanel` existe encore dans `components/Association/` mais n’est plus monté (flux
historique `DonateurService` ; les donateurs sont des contacts).
