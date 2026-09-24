# Page Paramètres — Fonctionnement

**Route** : `#/parametre`  
**Fichier** : `src/pages/Parametre/Parametre.tsx`  
**Plan** : 1 — Cœur + Paramètres (réalisé)

---

## 1. Rôle

La page Paramètres centralise la configuration de l'application, la gestion des profils utilisateur, des comptes/catégories, les outils de migration et les mises à jour. C'est le point d'entrée administratif de Comptal2.1.

---

## 2. Structure — 8 onglets

| Onglet | ID | Composant | Icône |
|--------|-----|-----------|-------|
| Général | `general` | `GeneralTab` | Settings2 |
| Profils | `profiles` | `ProfilesTab` | Users |
| Comptes | `accounts` | `AccountsTab` | Landmark |
| Catégories | `categories` | `CategoriesTab` | Tags |
| Données | `data` | `DataTab` | Database |
| Organisation | `organization` | `OrganizationTab` | Building2 |
| Plugins | `plugins` | `PluginsTab` | Puzzle |
| À propos | `about` | `AboutTab` | Info |

Navigation par boutons horizontaux en haut de page. Le mode d’usage du profil (Familiale / TPE / Association) se règle dans **Profils** ; **À propos** porte le positionnement honnête et la notice Données / confidentialité.

---

## 3. Onglet Général

**Fichier** : `components/Parametre/GeneralTab.tsx`

| Paramètre | Service | Persistance |
|-----------|---------|-------------|
| Langue (fr/en) | `SettingsService.save({ language })` | `settings.json` |
| Thème clair/sombre | `SettingsService.save({ theme })` + `applyThemeToDocument()` | `settings.json` |
| Zoom UI | `SettingsService.save({ zoom })` via `ZoomContext` | `settings.json` |
| Dimensions fenêtre | `WindowService.apply()` | `settings.json` → API Tauri window |
| Visibilité menus | `SettingsService.save({ menuVisibility })` | `settings.json` |

Presets fenêtre : 1280×800, 1400×900, 1600×900, plein écran, personnalisé.

---

## 4. Onglet Profils

**Fichier** : `components/Parametre/ProfilesTab.tsx`

Un profil = un dossier `data/profils/{id}/` + fichier `comptal.db`.

| Action | Service | Effet |
|--------|---------|-------|
| Lister | `ProfileService.list()` | Lit tous les `info.json` |
| Créer | `ProfileService.create(name, usageMode)` | Nouveau dossier + DB vide ; preset de menus selon le mode |
| Renommer | `ProfileService.rename(id, name)` | Met à jour `info.json` |
| Mode d’usage | `ProfileService.setUsageMode(id, mode)` | Familiale / TPE / Association → visibilité des menus |
| Activer | `ProfileService.setActive(id)` | Ferme/rouvre SQLite, sauve `activeProfileId` |
| Supprimer | `ProfileService.remove(id)` | Supprime dossier profil |
| Exporter ZIP | `ProfileService.exportZip(id, dest)` | `zip_dir` Tauri |
| Importer ZIP | `ProfileService.importZip(zipAbs)` | `unzip_to` Tauri |

**`profileEpoch`** : incrémenté à chaque changement de profil pour forcer le remontage des onglets Comptes, Catégories et Données (`key={accounts-${profileEpoch}}`).

---

## 5. Onglet Comptes

**Fichier** : `components/Parametre/AccountsTab.tsx`

CRUD sur la table `accounts` via `ConfigService` :

| Action | Méthode |
|--------|---------|
| Lister | `listAccounts()` |
| Créer | `createAccount({ code, name, color, initialBalance })` |
| Modifier | `updateAccount(id, fields)` |
| Supprimer | `deleteAccount(id)` — vérifie `countTransactionsForAccount()` avant |

---

## 6. Onglet Catégories

**Fichier** : `components/Parametre/CategoriesTab.tsx`

CRUD sur la table `categories` via `ConfigService` :

| Action | Méthode |
|--------|---------|
| Lister | `listCategories()` |
| Créer | `createCategory({ code, name, color })` |
| Modifier | `updateCategory(id, fields)` — renommage code propage vers `transactions` |
| Supprimer | `deleteCategory(id)` |

---

## 7. Onglet Données

**Fichier** : `components/Parametre/DataTab.tsx`

| Action | Service / commande | Description |
|--------|-------------------|-------------|
| Ouvrir dossier data | `tauriBridge.openPath(dataRoot)` | Explorateur système |
| Migrer depuis Comptal2 | `MigrationService.analyze()` puis `.migrate()` | Import CSV+JSON → SQLite |
| Export expert-comptable | `ExportService.exportAccountantCsv()` | CSV trésorerie (pas un FEC) |
| Archiver les transactions | `EditionService.archiveAll()` | Soft-delete (`deleted_at`), pas `DELETE FROM` |
| Reconstruire auto-cat | `AutoCategorisationService.rebuildFromTransactions()` | Recalcule `autocat_stats` |
| Vider stats auto-cat | `Db.execute('DELETE FROM autocat_stats')` | Reset apprentissage |

La migration affiche une progression via callback `setProgressMsg`. Les confirmations destructives rappellent la conservation 10 ans (CGI art. 1734).

---

## 8. Onglet Organisation

**Fichier** : `components/Parametre/OrganizationTab.tsx`

Centralise les informations de l’émetteur Entreprise/Association, les paramètres de numérotation,
les modèles PDF et les mentions légales. Les données sont persistées dans les tables
`invoice_emetteur`, `invoice_settings`, `association_config`, `pdf_templates` et `legal_mentions`.

| Sous-onglet | Composant | Fonctions |
|---|---|---|
| Identité société | `IdentityCompanyPanel` | Émetteur, validation SIRET/TVA/IBAN, recherche SIRENE |
| PDF factures | `PdfDocumentsPanel mode="invoices"` | Modèles devis/factures, mentions et aperçu |
| Identité association | `IdentityAssociationPanel` | Identité, statut fiscal, signataire et compteur |
| PDF reçus | `PdfDocumentsPanel mode="receipts"` | Modèle et aperçu des reçus fiscaux |
| Registres et PDF | `RegisterSettingsPanel` | Numérotation, types générables, aperçu PDF registre |

Les palettes (`PaletteService`, `ColorPaletteSelector`) s’appliquent aux onglets Comptes et
Catégories. Les regroupements de catégories passent par `ConfigService.listCategoryGroups` /
`createCategoryGroup`.

---

## 9. Onglet Plugins

**Fichier** : `components/Parametre/PluginsTab.tsx`  
**Service** : `PluginService` — ZIP via `unzip_to` Tauri, dossier `data/plugins/{id}/`.

| Action | Effet |
|---|---|
| Importer un ZIP | `manifest.json` (`format: comptal21-plugin`) + payload JSON |
| Activer | Écrit `plugin_state` du profil et applique packs (catégories, mentions, modèle d’import) |
| Désactiver | Reste sur disque, inactif pour ce profil |
| Supprimer | Dossier + ligne `plugin_state` (ConfirmModal) |

Types P0 : `category_pack`, `mention_pack`, `export_mapper`, `import_mapper`. Aucun JavaScript n’est exécuté. Voir [plugins-mods.md](../plugins-mods.md).

---

## 10. Onglet À propos

**Fichier** : `components/Parametre/AboutTab.tsx`

Positionnement produit (`legal.scope*`) et notice Données / confidentialité (`legal.privacy*`) :
utilisateur = responsable de traitement, conservation 10 ans, ZIP en clair, updater GitHub.

| Fonction | Service |
|----------|---------|
| Afficher version | `Logger.session.appVersion` |
| Vérifier mises à jour | `UpdateService.checkForUpdate()` |
| Télécharger + installer | `UpdateService.downloadInstallAndRelaunch()` |
| Relancer app | `tauri-plugin-process` relaunch |

Utilise `tauri-plugin-updater` pointant vers GitHub Releases.

---

## 11. Mécanisme de rechargement profil

```typescript
// Parametre.tsx
const [profileEpoch, setProfileEpoch] = useState(0);

<ProfilesTab onProfileChanged={() => setProfileEpoch((e) => e + 1)} />
<AccountsTab key={`accounts-${profileEpoch}`} />
```

Garantit que les onglets liés aux données du profil se rechargent après un changement.

---

## 12. Voir aussi

- [Carte Paramètres](../cartes/parametre.md)
- [Carte processus données](../carte-processus-donnees.md) — migration, profils
- [Plugins / mods](../plugins-mods.md)
- [Plan positions A/B/C](../plan-positions-ABC-complement-plugins.md)
