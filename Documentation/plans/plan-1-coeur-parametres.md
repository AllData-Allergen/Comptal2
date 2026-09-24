# Plan 1 — Cœur logiciel + Page Paramètres

**Statut : RÉALISÉ** (fondation en place)

## Objectif

Poser la fondation de Comptal2.1 : projet Tauri 2 + React 18 + TypeScript + Vite + Tailwind, base SQLite par profil, logger JSONL conforme aux règles, auto-updater GitHub, et page Paramètres complète.

## Ce qui est en place

### Backend (`src-tauri/`)
- Fenêtre principale 1400×900 (min 1024×768), redimensionnable, centrée (`tauri.conf.json`).
- Plugins : `sql` (sqlite), `dialog`, `updater`, `process`, `opener`.
- Commandes Rust (`src/commands.rs`) : `get_session_info`, `read_text_file`, `write_text_file`, `append_text_line`, `read_dir`, `path_exists`, `mkdirs`, `delete_file`, `delete_dir`, `copy_dir`, `zip_dir`, `unzip_to`, `read_external_text_file`, `read_external_dir`, `external_exists`, `open_path`.
- Racine de données (`src/paths.rs`) : `Comptal2.1/data/` en dev, `%APPDATA%/com.leopaul.comptal21/data` en production. Chemins relatifs uniquement (anti-traversée `..`).
- Clés updater générées dans `src-tauri/keys/` (gitignoré). Clé publique dans `tauri.conf.json`, endpoint GitHub Releases à ajuster quand le dépôt existera.

### Services renderer (`src/services/`)
- `logger.ts` : sessions JSONL `data/logs/AAAA-MM-JJ_HH-mm-ss_(type).jsonl`, tags `[LOGn]`, helper `withLog` (start/end/error obligatoires).
- `db.ts` : ouverture `sqlite:data/profils/{id}/comptal.db`, migrations par `PRAGMA user_version`, helpers `select`/`execute`/`inTransaction` journalisés. **Schéma v1** : `accounts`, `categories`, `imports`, `transactions` (index date/compte/catégorie), `autocat_stats`.
- `SettingsService.ts` : settings globaux (`data/parameter/settings.json`) — langue, thème, zoom, fenêtre, visibilité menus, profil actif. Pub/sub `subscribe()`.
- `ProfileService.ts` : CRUD profils (`data/profils/{id}/`), activation (ouvre la base), export/import ZIP, `ensureInitialized()` au boot.
- `ConfigService.ts` : CRUD comptes/catégories en SQL (renommage de code répercuté sur les transactions).
- `WindowService.ts` : presets 1280×800 / 1400×900 / 1600×900 / 1920×1080, custom, plein écran.
- `UpdateService.ts` : check → download (progression) → install → relaunch.
- `MigrationService.ts` : profil Comptal2 (account.json, categories.json, CSV `Source;Compte;Date;…`) → SQLite. Dates dd/MM/yyyy → ISO, montants FR, comptes créés au besoin, insertion par lots de 100 en transaction.

### UI
- `MainLayout` + `Sidebar` (lucide, visibilité par settings) + `ThemeToggle` + `ZoomControl` (50–200 %).
- Page Paramètres : onglets Général (langue, thème, **cadrage fenêtre**, visibilité menus), Profils, Comptes, Catégories, Données (emplacement, **migration Comptal2**, zone dangereuse), À propos (**mises à jour**).
- Charte visuelle : `src/styles/variables.css` (variables `--invoicing-*` de Comptal2) + classes `ct-*` (`ct-card`, `ct-btn-primary`…).
- i18n fr/en (`src/i18n/locales/`), react-toastify pour les retours utilisateur.

## Reste à faire (hors périmètre plans 2-5)

- Renseigner le vrai dépôt GitHub dans `tauri.conf.json > plugins.updater.endpoints` et publier `latest.json` à chaque release (`tauri build` avec `TAURI_SIGNING_PRIVATE_KEY_PATH=src-tauri/keys/comptal21.key`).
- Onboarding première utilisation (équivalent GuidedTour de Comptal2) si souhaité.
