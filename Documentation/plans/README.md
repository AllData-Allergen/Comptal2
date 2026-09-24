# Lecture des plans Comptal2.1

## Ordre d’autorité

1. Code de la branche courante et schéma `src/services/db.ts`.
2. [Plan directeur actuel](./plan-directeur-actuel.md).
3. Documentation des pages et cartes.
4. Plans historiques.

Les plans historiques décrivent l’intention au moment de leur rédaction. Ils ne doivent pas être
utilisés pour déduire l’état livré lorsqu’ils contredisent le code.

## Index

| Document | Nature | Statut |
|---|---|---|
| `plan-1-coeur-parametres.md` | Lot initial | Livré puis étendu |
| `plan-2-upload.md` | Lot initial | Livré |
| `plan-3-edition.md` | Lot initial | Livré puis étendu |
| `plan-4-dashboard.md` | Intention initiale | Livré avec interface révisée |
| `plan-5-finance.md` | Intention initiale | Livré avec sidebar droite |
| `plan-6-projet-EN-ATTENTE.md` | Ancien plan Projet | Remplacé par Prévisionnel livré |
| `*.plan.md` | Captures de plans Cursor | Archives de conception |

## Écarts historiques connus

- Dashboard n’utilise plus `DateRangeSlider` ni tableau de transactions.
- Finance place ses outils dans une sidebar droite.
- Prévisionnel utilise `ForecastGrid`, pas Univer.
- Paramètres comporte sept onglets avec Organisation.
- Contacts, Facturation et Dons (ex-page Association redistribuée) ont été livrés après les plans 1–6.

Les liens internes cassés contenus dans certaines captures `*.plan.md` sont conservés comme trace
historique et ne font pas partie de la documentation active.
