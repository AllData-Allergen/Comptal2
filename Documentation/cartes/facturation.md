# Carte — Facturation

## Flux documentaire

```mermaid
stateDiagram-v2
    [*] --> Devis
    Devis --> Envoye
    Envoye --> Accepte
    Envoye --> Caduc: signature + motif éventuel
    Accepte --> Facture: génération liée
    Facture --> Envoyee
    Envoyee --> Partielle: paiement < TTC
    Envoyee --> Payee: paiement = TTC
    Envoyee --> Retard: échéance dépassée
    Partielle --> Payee
    Caduc --> [*]: document conservé
    Payee --> [*]
```

## Dépendances

Les dépendances sont regroupées par responsabilité. Une ligne correspond à un flux indépendant ;
les liaisons ne se croisent donc pas.

```mermaid
flowchart TB
    subgraph documents [Documents]
        direction LR
        UI1[DocumentsPanel / modales] --> INV[InvoiceService]
        INV --> EMIT[EmetteurService]
        INV --> ATT[AttachmentService]
        INV --> DB[(devis / factures)]
    end

    subgraph catalogue [Catalogue]
        direction LR
        UI2[Onglet Postes] --> POSTE[PosteService]
        POSTE --> PDB[(postes / groupes / secteurs)]
    end

    subgraph paiements [Paiements]
        direction LR
        UI3[Modale de paiement] --> PAY[PaymentTrackingService]
        PAY --> STATS[StatsService]
        STATS --> TX[(transactions)]
    end

    subgraph exportPdf [Production PDF]
        direction LR
        UI4[Action Générer le PDF] --> PDF[PDFService]
        PDF --> FILE[Fichier PDF externe]
    end
```

## Calcul d’un paiement proposé

```mermaid
flowchart TD
    TX[Transaction créditrice non liée] --> LABEL[Tester le numéro dans le libellé]
    LABEL --> AMOUNT[Tester le montant TTC ou le reste]
    AMOUNT --> SCORE[Calculer le score combiné]
    SCORE --> SORT[Tri score puis date]
    SORT --> LINK[Liaison explicite ou automatique par libellé]
    LINK --> STATUS[Statut + reste à encaisser]
```

## Arborescence des fonctions

```
Facturation.tsx
├── setTab('docs' | 'postes')
├── DocumentsPanel
│   ├── reload → ClientService.loadBillingClients, InvoiceService.loadDevis/loadFactures, StatsService.listAllTransactions
│   ├── openPdf → PDFService + AttachmentService
│   ├── DevisModal / FactureModal → DocumentEditor
│   │   ├── InvoiceService.calculateTotals / peekNextNumero / generateNumero / upsertDevis / upsertFacture
│   │   └── PosteService.loadPostes
│   ├── GestionDevisRow / GestionFactureRow
│   ├── PaiementFactureModal → PaymentTrackingService
│   └── CaducDevisModal → InvoiceService.markDevisCaduc
└── PostesPanel kind="facturation"
    └── PosteService.loadPostes / savePostes / loadPostesGroupes / savePosteGroupe
```

