# Anciennes pages à venir — statut actuel

Ce document est conservé pour expliquer les anciennes routes. Il n’existe plus de placeholder
`ComingSoon` dans `src/App.tsx` pour ces domaines.

---

## 1. Gestion de projets devenue Prévisionnel

| Attribut | Valeur |
|----------|--------|
| Route canonique | `#/previsionnel` |
| Alias | `#/project-management` redirige vers la route canonique |
| Clé i18n | `pages.projectManagement` |
| Plan | Plan 6 réalisé sous une forme révisée |
| Fichier page | `src/pages/Previsionnel/Previsionnel.tsx` |

La page possède une grille, des groupes, des lignes récurrentes, plusieurs prévisions et des widgets.

---

## 2. Entreprise devenue Facturation

| Attribut | Valeur |
|----------|--------|
| Route canonique | `#/facturation` |
| Alias | `#/invoicing` redirige vers la route canonique |
| Clé i18n | `pages.invoicing` |
| Statut | Réalisé |
| Fichier page | `src/pages/Facturation/Facturation.tsx` |

Le module gère les contacts, postes, devis, factures, paiements, pièces jointes et PDF.

---

## 3. Ancienne page Association — redistribuée

Il n’y a plus de page menu « Association ». Les responsabilités sont réparties :

| Ancienne responsabilité | Lieu actuel |
|-------------------------|-------------|
| Identité, éligibilité, signataire, PDF reçus | Paramètres → Organisation |
| Fiches donateurs | Contacts (`#/clients`, rôle `donateur`) |
| Journal, rapprochement, corrélations, émission | **Dons** (`#/dons`) |
| États annuels figés | Registre (`#/registre`) |

| Attribut page Dons | Valeur |
|----------|--------|
| Route canonique | `#/dons` |
| Alias | `#/association` redirige vers `#/dons` |
| Clé i18n | `pages.association` / `navigation.association` (libellé « Gestion des dons ») |
| Statut | Réalisé |
| Fichier page | `src/pages/Association/Association.tsx` (nom de dossier hérité) |

---

## 4. Registre documentaire

| Attribut | Valeur |
|----------|--------|
| Route | `#/registre` |
| Clé i18n | `pages.register` / `navigation.register` |
| Statut | Réalisé |
| Fichier page | `src/pages/Register/Register.tsx` |

---

## 5. Visibilité dans la sidebar

Les pages optionnelles se masquent via Paramètres → Général (`AppSettings.menuVisibility`).
Paramètres reste toujours visible.

```typescript
menuVisibility: {
  dashboard: boolean;
  upload: boolean;
  edition: boolean;
  financeGlobal: boolean;
  projectManagement: boolean;
  invoicing: boolean;
  clients: boolean;
  association: boolean;
  register: boolean;
}
```

Géré par `Sidebar.tsx` qui filtre `ALL_MENU_ITEMS` selon `SettingsService.current.menuVisibility`.

---

## 6. Voir aussi

- [Prévisionnel](./previsionnel.md)
- [Facturation](./facturation.md)
- [Dons](./dons.md)
- [Registre](./registre.md)
- [Amortissement](./amortissement.md)
- [Plan directeur actuel](../plans/plan-directeur-actuel.md)
