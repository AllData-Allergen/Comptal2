# Plan d’officialisation — Comptal2.1

**Date de recherche :** septembre 2026 ( consignation au 6 septembre 2026 ).  
**Destinataire :** particulier, budget faible, projet open source (desktop Tauri / React / SQLite, sans cloud).  
**Statut du document :** plan d’action sourcé, **pas un avis juridique**. Avant toute attestation, vente ou mention commerciale, faire relire par un avocat (droit fiscal / PI / contrats) et, si besoin, un expert-comptable.

---

## 1. Synthèse exécutive

Il n’existe **pas** de liste Bercy / DGFiP / ANC des logiciels de comptabilité « approuvés ». L’État n’homologue pas Comptal. Ce qui existe vraiment, ce sont des **obligations pesant sur l’utilisateur** (FEC en contrôle, mentions de facture, facturation électronique via une **plateforme agréée**, éventuellement logiciel de caisse sécurisé) et des **preuves optionnelles de marketing** (NF 525, NF 203, ISO, labels).

Comptal2.1, aujourd’hui, est un **logiciel de trésorerie locale** (comptes bancaires, transactions débit/crédit, catégories), plus **facturation** (devis → factures → paiements) et **gestion associative** (dons, reçus fiscaux, signature du président). Ce n’est **pas** une comptabilité en partie double au Plan comptable général : pas de journaux, pas de grand livre PCG, **pas d’export FEC**. Le présenter comme « logiciel de comptabilité certifié / agréé DGFiP » serait **faux** et risqué.

**Décision recommandée pour un particulier open source :** rester **hors champ** de l’article 286, I, 3° bis du CGI (caisse anti-fraude TVA / NF 525), **ne pas** devenir plateforme agréée (ex-PDP), et construire la crédibilité sur : (1) un **positionnement honnête**, (2) une **personne morale identifiée**, (3) une **licence et des binaires versionnés**, (4) un **FEC optionnel** seulement si l’on assume le métier « comptabilité informatisée », (5) un **raccordement à une plateforme agréée** déjà immatriculée (jamais Comptal lui-même), (6) le **renforcement de ce qui existe déjà** (factures, reçus Cerfa, signature).

**Ce qu’il ne faut jamais écrire :** « certifié DGFiP », « agréé Bercy », « homologué ANC », « NF 525 » ou « NF 203 » sans l’être, « plateforme agréée » sans figurer sur la liste impots.gouv.fr.

**Budget réaliste 12 mois :** 0–200 € pour le socle juridique + marque + communication honnête. **2 000 €** pour un avocat + expert-comptable bêta + mentions facture / Factur-X. **10 000 €** pour une EURL, RC pro, premier connecteur PA et éventuellement un pré-audit — **pas** pour une NF 525 complète (souvent 10–30 k€ d’entrée + surveillance annuelle, hors développement).

---

## 2. Ce que « officiel / approuvé » veut dire réellement en France

### 2.1 Ce que ça ne veut **pas** dire

| Mythe commercial | Réalité (septembre 2026) | Source |
|---|---|---|
| « Agrément État / Bercy / DGFiP du logiciel de compta » | **N’existe pas.** L’ANC publie des **normes** (PCG), pas une liste de logiciels. La DGFiP publie une liste d’**opérateurs de dématérialisation immatriculés** (plateformes agréées), pas d’éditeurs de compta. | [ANC — règlements](https://www.anc.gouv.fr/normes-comptables-francaises/reglements-de-lanc) ; [Liste des plateformes agréées](https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees) |
| « Logiciel présent sur une liste officielle = légal pour tout le monde » | La seule liste officielle utile ici est celle des **plateformes agréées**. Un logiciel de compta / facturation est au mieux une **solution compatible**, non immatriculée. | [Facturation électronique et PA](https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees) ; [Présentation des labels (PDF DGFiP)](https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fe_presentation-des-labels.pdf) |
| « NF 525 = agrément fiscal de toute la compta » | NF 525 (Infocert / AFNOR) et la certification LNE/BYCYB portent sur les **systèmes de caisse / encaissement**, pas sur la comptabilité générale. | [économie.gouv.fr — logiciels de caisse](https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/ce-quil-faut-savoir-sur-la-certification-des-logiciels-de-caisse) ; [Infocert NF 525](https://infocert.org/certification-logiciel-de-caisse/) ; [LNE / BYCYB](https://www.lne.fr/fr/service/certification/certification-systemes-caisse-bycyb) |
| « NF 203 = obligatoire pour vendre un logiciel de compta » | **Démarche volontaire** de qualité (marque NF Logiciel). Avantage AO / cabinets, pas un sésame fiscal. | [Infocert NF 203](https://infocert.org/nf203-comptabilite-informatisee/) ; [AFNOR NF Logiciel](https://certification.afnor.org/numerique/nf-logiciel) |
| « Le PPF public gratuit remplace une PA » | Le Portail public de facturation est recentré (annuaire + concentrateur). **Pas** d’émission / réception B2B directe gratuite. | [économie.gouv.fr — facturation électronique](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises) ; guide pratique DGFiP 1er sept. 2026 |
| « Open source = hors la loi caisse » | Le BOFiP vise **aussi** les logiciels libres. En cas de modification du code, l’utilisateur peut devenir « éditeur ». | [BOI-TVA-DECLA-30-10-30](https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325) § 45 et exemple 4 |

### 2.2 Ce qui existe vraiment (pile des preuves)

1. **Normes comptables (ANC)** — Le logiciel peut *aider* à les respecter ; l’ANC n’agrée pas le produit. PCG consolidé 2026 : [règlement ANC n° 2014-03](https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/recueil/2026/PCG--1er-janvier-2026.pdf). Associations : règlement ANC n° 2018-06.
2. **FEC (contrôle fiscal)** — Obligation de **l’entreprise** qui tient une comptabilité informatisée, **à remettre au vérificateur**, pas à déposer chaque année. Outil DGFiP : Test Compta Demat (le rapport **n’engage pas** l’administration).
3. **Anti-fraude TVA / caisse (CGI art. 286, I, 3° bis)** — Uniquement si l’utilisateur assujetti encaisse des **particuliers** via une **fonctionnalité de caisse**. Preuve depuis le **21 février 2026** : **certificat** d’organisme accrédité **ou attestation individuelle** de l’éditeur (loi n° 2026-103, art. 125).
4. **Factures** — Mentions CGI (art. 242 nonies A de l’annexe II) + Code de commerce. Depuis le **1er septembre 2026**, obligation de **recevoir** des factures électroniques via une **plateforme agréée** pour les assujettis concernés ; émission GE/ETI 2026, PME/micro **1er septembre 2027**.
5. **Reçus fiscaux / dons** — Pas d’agrément du *logiciel*. L’**organisme** doit être éligible (art. 200 / 238 bis CGI) ; le Cerfa 11580 (2041-RD) est un **modèle** à respecter. Rescrit mécénat = sécurité de l’association, pas de l’éditeur.
6. **Marque / éditeur** — INPI, SIREN, contrats, licence. Ça rend le projet « identifiable », pas « fiscalement certifié ».
7. **Labels privés / qualité** — NF, ISO 9001, ISO 27001 : payants, optionnels, utiles en B2B / collectivités.

### 2.3 La seule liste « agrément État » qui compte en 2026

**Plateformes agréées (PA, ex-PDP)** immatriculées par la DGFiP pour 3 ans, après dossier + tests d’interopérabilité.

- Page officielle : [Je consulte la liste des plateformes agréées](https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees) (fichiers ODS / XLSX / PDF ; page modifiée début septembre 2026).
- Un logiciel **absent** de cette liste n’est **pas** une plateforme agréée, quels que soient logo ou discours.
- Le label **« Solution compatible – Facturation électronique »** (document DGFiP) suppose un **raccordement à une PA** ; ce n’est **pas** une immatriculation.

---

## 3. Ancrage produit : ce que Comptal2.1 est (et n’est pas)

D’après le code et la documentation interne (`schema-sqlite.md`, pages Facturation / Dons, plan directeur) :

| Brique | État actuel | Conséquence « officialisation » |
|---|---|---|
| Trésorerie | Comptes, imports, transactions débit/crédit, catégories, code `X` (TIC) | Outil de **suivi bancaire**, pas un journal PCG |
| Partie double / FEC | **Absent** | Ne pas se dire « comptabilité informatisée » au sens L. 47 A LPF tant que le FEC n’existe pas |
| Facturation | Devis → factures, numéros, TVA, paiements (dont chèque/espèces), pièces jointes, pas de suppression (caduc) | Mentions légales + e-invoicing à caler ; **risque de glisser vers la « caisse »** si on mémorise extra-comptablement des encaissements B2C |
| Dons (domaine associatif) | Dons, corrélations, Cerfa, signature président, registre des reçus, 2041-RD / 2041-MEC-SD | Déjà le bon *outil* ; l’éligibilité fiscale reste **à l’association utilisatrice** |
| Architecture | Desktop local, SQLite par profil, pas de cloud | Point fort RGPD / souveraineté ; **incompatible** avec le métier de PA (immatriculation, ISO 27001, hébergement UE, interop PPF) |
| Licence projet | Pas de `LICENSE` à la racine de Comptal2.1 (hors patch Tauri) | À corriger **avant** toute attestation ou contribution externe |

**Formulation commerciale honnête recommandée :**  
« Logiciel libre de **gestion de trésorerie**, de **facturation** et de **dons associatifs**, pour un usage local (famille, TPE, association). **Complément** d’un logiciel de comptabilité (Sage, Cegid, Quadra, cabinet) via export CSV — pas un ersatz. Il n’est ni une plateforme agréée, ni un logiciel de caisse certifié, ni un substitut à un expert-comptable. Adaptable par **import de mods JSON**. »

**Position retenue (septembre 2026, session P0) :** A + B (facturation TPE) **sans** devenir C (FEC). Détail d’exécution : `Documentation/plan-positions-ABC-complement-plugins.md`.

---

## 4. Obligations réellement opposables selon le positionnement

Choisir **un** positionnement et s’y tenir. Les obligations changent.

### 4.1 Position A — Trésorerie + asso (recommandé à court terme)

**Cible :** associations, TPE qui importent des relevés, suivi de catégories, reçus fiscaux.

| Sujet | Opposable à l’éditeur ? | Opposable à l’utilisateur ? |
|---|---|---|
| FEC | Non, si le logiciel **n’est pas** présenté comme tenant la comptabilité informatisée | Oui, **si** l’utilisateur tient sa compta informatisée **ailleurs** (cabinet, autre logiciel) |
| CGI 286 caisse | Non, **si** Comptal ne mémorise pas extra-comptablement les règlements de particuliers (voir § 6) | Non, tant qu’il n’utilise pas Comptal comme caisse B2C |
| Mentions facture | Oui, si le module facturation est proposé : le PDF doit être **conforme** | Oui, l’émetteur reste responsable de la facture |
| E-invoicing B2B | Comptal **ne peut pas** transmettre seul aux clients / à la DGFiP | L’assujetti doit avoir une **PA** ; Comptal peut au mieux être « compatible » plus tard |
| Reçus fiscaux | Fournir un modèle fidèle au Cerfa ; ne pas garantir l’éligibilité | Association : éligibilité + rescrit ; amende si reçus indus |
| RGPD | Minimiser (données locales) ; politique de confidentialité si site / téléchargement | Responsable de traitement = l’utilisateur sur **sa** machine |

### 4.2 Position B — Logiciel de facturation TPE (B2B)

En plus de A :

- Mentions actuelles + **4 mentions** liées à la réforme (SIREN client, adresse de livraison si différente, nature biens/services/mixte, option TVA sur les débits) selon le calendrier d’**émission** de l’utilisateur ([Service-Public F31808](https://entreprendre.service-public.gouv.fr/vosdroits/F31808)).
- Formats structurés **Factur-X / UBL / CII** pour parler aux PA ([FNFE-MPE Factur-X](https://fnfe-mpe.org/factur-x/)).
- **Ne pas** devenir PA. S’adosser à une PA (API) = label « solution compatible » possible, coût et contrat.

**Chorus Pro** reste le canal **B2G** (fournisseurs du public), opéré par l’AIFE : [chorus-pro.gouv.fr](https://chorus-pro.gouv.fr/) — distinct du B2B via PA.

### 4.3 Position C — Comptabilité informatisée (FEC)

**Non retenue pour Comptal.** Dès qu’on dirait « logiciel de comptabilité » et qu’on produirait des **écritures validées** :

- Intangibilité des écritures (validation, pas d’édition silencieuse) — doctrine BOI-BIC-DECLA-30-10-20-40 et PCG.
- Export **FEC** conforme [art. L. 47 A et A. 47 A-1 LPF](https://www.impots.gouv.fr/les-comptabilites-informatisees), 18 champs, nommage `SIRENFEC…`.
- Contrôle interne avec **Test Compta Demat** ([GitHub DGFiP](https://github.com/DGFiP/Test-Compta-Demat), [page économie.gouv.fr](https://www.economie.gouv.fr/dgfip/outil-de-test-des-fichiers-des-ecritures-comptables-fec)). Le rapport **n’est pas** une attestation d’État.
- Amende utilisateur : **5 000 €** ou 10 % des droits (CGI art. 1729 D) en cas de FEC absent ou non conforme ([BOI-CF-IOR-60-40-10](https://bofip.impots.gouv.fr/bofip/9026-PGP.html/identifiant=BOI-CF-IOR-60-40-10-20211215)).
- NF 203 : **option marketing**, pas un substitut au FEC.

**Décision produit :** rester A/B. L’export CSV s’appelle **trésorerie / expert-comptable**, jamais FEC. Un chantier C (journaux, plan de comptes, Test Compta Demat) reste un pivot 18–36 mois, pas le métier actuel.

**Cibles A/B adaptées :** familiale (trésorerie), TPE (facturation), association (dons) — **une** application, trois modes d’usage, plus plugins JSON.

### 4.4 Position D — Entrer dans le champ « caisse » (à éviter sauf pivot commerce)

Le BOFiP ([BOI-TVA-DECLA-30-10-30](https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325) § 10–40) :

- Champ : assujetti TVA qui encaisse des **non-assujettis** via un logiciel qui **mémorise extra-comptablement** les paiements.
- **Hors champ** : 100 % B2B facturé ; franchise en base ; opérations exonérées ; pas de logiciel de caisse (papier / tableur sans mémorisation).
- Un logiciel « de compta / facturation / gestion » **entre dans le champ dès qu’il a une fonctionnalité de caisse**.
- Si paiement → écriture comptable **obligatoire, instantanée, automatique, sans intervention humaine**, ce n’est pas de l’extra-comptable — mais Comptal **n’a pas** aujourd’hui ce moteur d’écritures.

**Preuve 2026 :** certificat **ou** attestation individuelle (modèle [BOI-LETTRE-000242](https://bofip.impots.gouv.fr/bofip/10692-PGP.html/identifiant=BOI-LETTRE-000242-20260325)).  
**Amende utilisateur :** 7 500 € / logiciel (CGI 1770 duodecies).  
**Fausse attestation :** délit (C. pén. art. 441-1) — rappel **imprimé sur le modèle BOFiP**.

### 4.5 Position E — Devenir plateforme agréée

**Irréaliste** pour un particulier : ISO 27001, hébergement UE / SecNumCloud si hébergeur, audit, tests AIFE/PPF, surveillance 3 ans, SIREN à jour fiscalement. Immatriculation **gratuite** administrativement, **investissement** typiquement **centaines de milliers à millions d’euros**. Dossier : [demarche.numerique.gouv.fr](https://demarche.numerique.gouv.fr/commencer/immatpdp/dossier_vide) ; [guide utilisateur immatriculation (PDF)](https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/guide_utilisateur_fe_ds_immatriculation_pdp.pdf).

---

## 5. Parcours recommandé (décisionnel)

```text
Comptal2.1 aujourd’hui
        |
        v
[1] Positionnement public HONNÊTE
    "trésorerie + facturation + dons, local, non certifié"
        |
        +-- Voulez-vous une caisse B2C (ticket, espèces, Z de caisse) ?
        |         oui --> STOP open source low-cost :
        |                 soit attestation (responsabilité pénale + technique ISCA),
        |                 soit NF 525 / LNE (≥ 10 k€ + doc + audits).
        |                 Recommandé : NON.
        |
        +-- Voulez-vous "vraie compta" (bilan, journaux, FEC) ?
        |         non --> rester Position A/B (recommandé 12–24 mois)
        |         oui --> Position C : chantier FEC + PCG (18–36 mois),
        |                 NF 203 seulement si budget >> 10 k€
        |
        v
[2] Personne morale minimale (micro ou asso 1901)
[3] Licence + binaires signés + qui est "l'éditeur"
[4] Mentions facture + (plus tard) Factur-X
[5] Reçus : déjà là — documenter la responsabilité de l'asso
[6] Crédibilité : EC bêta, communautés FLOSS, PAS de faux label
[7] E-invoicing : partenariat PA, jamais "on est agréé DGFiP"
```

**Verdict :** pour un particulier open source, le chemin « vrai logiciel de comptabilité approuvé » **n’existe pas**. Le chemin qui existe est : **outil sérieux, identifiable, conforme sur son périmètre, relais vers expert-comptable et vers une PA**.

---

## 6. Rester hors champ NF 525 vs y entrer

### 6.1 Rester hors champ (recommandé)

Actions produit (sans tout spécifier ici) :

1. **Ne pas** se présenter comme logiciel / système de caisse.
2. **Ne pas** offrir un mode « enregistrement des règlements de particuliers » extra-comptable (espèces / CB / chèque mémorisés comme un TPV).
3. Le rapprochement **facture ↔ transaction bancaire importée** (déjà dans `PaymentTrackingService`) reste du **lettrage de trésorerie**, pas une caisse, **si** on ne crée pas un journal d’encaissements B2C indépendant de la banque.
4. Encadrer la saisie manuelle chèque/espèces : la documenter comme **saisie de paiement sur facture B2B**, ou la désactiver / avertir pour le B2C.
5. Page « Conformité » : champ d’application, ce que l’utilisateur **ne doit pas** faire avec Comptal.
6. Si un fork ajoute une caisse, **l’attestation Comptal ne le couvre pas** (BOFiP § 315).

### 6.2 Entrer dans le champ (seulement si pivot commerce)

Alors **obligation de preuve** pour **chaque assujetti utilisateur** :

| Voie | Qui signe / audite | Coût éditeur (ordres de grandeur 2025–2026) | Délai | Faisabilité OSS |
|---|---|---|---|---|
| **Attestation individuelle** | Représentant légal de l’**éditeur** (modèle BOFiP, 2 volets, nominative) | Rédaction + **preuve technique ISCA** (inaltérabilité, sécurisation, conservation, archivage, clôtures, archives format ouvert). Le PDF est « gratuit » ; le code ne l’est pas. | Semaines–mois de dev | Possible **uniquement** sur une **version figée** dont vous maîtrisez le binaire. Fausse attestation = **3 ans / 45 000 €** (C. pén. 441-1). |
| **NF 525** (Infocert / AFNOR) | Organisme accrédité | Fourchette marché souvent citée **10–30 k€** 1er cycle + surveillance annuelle ; devis obligatoire. Témoignage d’éditeur (forum, 2025) : audit LNE ~12 k€ + suivi ~4,8 k€/an + doc. | 2 jours d’audit + mois de mise en conformité | Lourde : documentation, process qualité, versions maîtrisées. Un fork casse le certificat. |
| **Certification LNE / BYCYB** | [BYCYB](https://www.lne.fr/fr/service/certification/certification-systemes-caisse-bycyb) (filiale LNE) | Devis après questionnaire. Même ordre de grandeur. | Idem | Identique : pas un parcours 0 €. |

**Qui est « l’éditeur » en open source ?** (BOFiP § 300–315, exemple 4)

- Éditeur = celui qui **détient le code source** et **maîtrise** les paramètres ISCA.
- Logiciel **ouvert** + recompilation / patch par l’utilisateur → **l’utilisateur devient éditeur** de **sa** version.
- Conséquence pratique :
  - Vous attestez **uniquement** les **releases officielles** (installateur signé, hash, numéro de version).
  - Licence + CGU : « toute modification invalide l’attestation ».
  - Un fork doit **ré-attester** ou se certifier.
  - Si l’utilisateur développe **pour ses propres besoins** sans activité d’édition réelle → le BOFiP impose en principe un **certificat** d’organisme, pas une auto-attestation (§ 375).

**NF 525 n’est plus le passage obligé** depuis le 21/02/2026, mais rester une **preuve tierce** plus lisible en contrôle. Pour un budget < 10 k€, **ne pas y aller**.

---

## 7. Facturation électronique : PDP / PA vs s’adosser

| Option | Pour Comptal | Coût | Verdict |
|---|---|---|---|
| Devenir PA | Cloud, 24/7, ISO 27001, tests PPF, 3 ans | 100 k€–M€ | **Non** |
| Utiliser le PPF comme « logiciel de facture » | Le PPF n’émet / ne reçoit plus les factures B2B | — | **Non** |
| **Solution compatible** raccordée à une PA de la liste officielle | Export Factur-X + API partenaire | 0–quelques k€ d’intégration ; l’**utilisateur** paie la PA (souvent 0–50 €/mois TPE) | **Oui, phase 2–3** |
| Chorus Pro | Uniquement **B2G** | Gratuit côté portail public | Optionnel si clients publics |
| Factur-X seul (PDF/A-3 + XML) | Prépare l’interop, **ne remplace pas** la PA pour transmettre | Dev interne / biblio libre | **Oui, dès que le module facture est « sérieux »** |

Alternatives associatives / FLOSS à **étudier** (vérifier **toujours** la [liste DGFiP](https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees) au moment du partenariat ; les blogs recopient des listes périmées) :

- Standard ouvert : [Factur-X (FNFE-MPE)](https://fnfe-mpe.org/factur-x/) — version 1.09.2 publiée août 2026.
- ERP OSS qui **opèrent** une PA (ex. communications Axelor 2026) : ce sont des **sociétés**, pas un commun à réutiliser tel quel.
- PA « low cost / gratuites » pour TPE : existent sur le marché 2026 ; **aucun partenariat n’est officiel tant que le nom n’est pas dans le fichier DGFiP**.

**Ne pas** inventer un numéro d’immatriculation ni un logo « Plateforme agréée » (marque de garantie DGFiP).

---

## 8. Reçus fiscaux, dons, associations

**Déjà dans Comptal2.1** (plan 9 : Dons + Organisation + Contacts + Registre) : journal des dons, corrélation catégorie/contact, Cerfa, signature du président, registre, distinction particulier (2041-RD) / entreprise (2041-MEC-SD, Cerfa 16216), dons anonymes sans reçu nominatif.

**Ce qui n’est pas dans le logiciel et ne doit pas être promis :**

| Sujet | Qui | Source |
|---|---|---|
| Être « organisme d’intérêt général » | L’association utilisatrice | [impots.gouv.fr — Dons](https://www.impots.gouv.fr/professionnel/dons-et-reduction-dimpot) |
| Rescrit mécénat (L. 80 C LPF), silence = accord 6 mois | L’association | [Service-Public F34246](https://www.service-public.gouv.fr/particuliers/vosdroits/F34246) ; dépôt [demarche.numerique.gouv.fr](https://demarche.numerique.gouv.fr/) |
| Agrément du *logiciel* de reçus | **N’existe pas** | — |
| Amende si reçus délivrés à tort | L’organisme, taux = réduction indue | Même page impots.gouv.fr |
| Signature | Représentant habilité (président / mandataire) ; dématérialisation admise si mentions + imputabilité | Doctrine mécénat + pratique Cerfa |

**Action éditeur :** UI d’aide (éligibilité = case à cocher **déclarative** de l’asso, lien rescrit, modèle officiel), **jamais** « Comptal agrée vos dons ». Conserver les mentions du Cerfa à jour (vérifier le millésime *05* ou suivant sur impots.gouv.fr).

Comptes annuels asso (ANC 2018-06) : **hors périmètre actuel** ; ne pas laisser croire que le dashboard remplace un bilan associatif.

---

## 9. Statut juridique minimal de l’éditeur

La **SCI** n’a aucun rôle ici (immobilier).

| Forme | Coût de création | Responsabilité | Utile pour | Limites |
|---|---|---|---|---|
| **Particulier sans structure** | 0 € | Illimitée, floue pour signer une attestation « société » | Proto, usage perso | Impossible de facturer proprement ; attestation BOFiP vise un représentant d’éditeur |
| **Micro-entreprise (EI)** | **0 €** au [guichet unique](https://formalites.entreprises.gouv.fr/) | **Illimitée** sur le patrimoine (malgré options d’affectation) | SIREN, facturer dons/support, signer en nom commercial | Plafond services ~83 600 € CA (barème 2026–2028, à revérifier) ; CFE à partir de l’année N+1 |
| **Association loi 1901** | Déclaration gratuite ; publication JOAFE selon tarif du JO | Dirigeants : faute de gestion ; asso : patrimoine de l’asso | Communauté FLOSS, dons, subventions, marque au nom de l’asso | Pas de partage des bénéfices ; mixage vente / non lucratif à surveiller (rescrit lucrativité) |
| **EURL / SASU** | ~200–400 € formalités + expert-comptable | **Limitée aux apports** (sauf faute) | Attestations, RC pro, recruter, lever de l’aide BPI | Trop lourd au palier 0–200 € ; pertinent vers 2–10 k€ si l’on **vend** et **atteste** |

**Recommandation par phase :**

1. **0–12 mois :** micro-entreprise **ou** asso 1901 (l’asso colle mieux à l’open source communautaire ; la micro colle mieux si vous facturez du support). On peut **cumuler** asso (communauté) + micro (prestations), ce sont deux personnes distinctes.
2. **Si attestation caisse ou vente payante significative :** passer en **EURL/SASU** + RC professionnelle.
3. Clause licence : **aucune garantie** (software « as is ») **et**, si vous attestez, cette clause **ne vous protège pas** contre une attestation mensongère.

Codes d’activité typiques (INSEE les attribue) : 58.29C édition de logiciels applicatifs, 62.01Z programmation, 62.02A conseil. Le BOFiP indique que le **code NAF seul** ne prouve pas l’activité d’éditeur (§ 375).

---

## 10. Propriété intellectuelle et licence

**Constat :** Comptal2.1 n’a pas de licence claire à la racine. Sans licence, le code n’est **pas** libre (tous droits réservés par défaut).

| Licence | Attestation / forks | Contributions | Recommandation Comptal |
|---|---|---|---|
| **MIT / BSD** | Forks propriétaires faciles ; qui atteste ? | Très simples (DCO suffit) | OK pour libs internes, **faible** pour un « éditeur officiel » |
| **GPL-3.0** | Copyleft, forks restent libres | CLA optionnelle | Possible |
| **AGPL-3.0** | Copyleft y compris usage réseau (utile si un jour un service) | Idem | **Meilleur défaut** pour un desktop qui pourrait avoir un pont PA |
| **Licence duale** (AGPL + commerciale) | L’entité éditrice vend des exceptions | CLA **nécessaire** | Plus tard, si EURL |

**Règles opérationnelles :**

1. Déposer **AGPL-3.0-or-later** + `NOTICE` + copyright de l’entité.
2. **Contributor License Agreement** (ou DCO + cession limitée) : l’entité peut signer des attestations et, plus tard, dual-licencier.
3. Releases : tags git, **SHA-256**, signature (minisign / Sigstore). L’attestation ne vise **que** ces artefacts.
4. Marque **Comptal** : dépôt INPI **190 €** la 1re classe (souvent classe 9 logiciels et/ou 42 SaaS/services) — [tarifs INPI](https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/deposant-et-cout-dune-marque). Une asso ou un particulier **peut** déposer. La marque empêche un fork de se faire passer pour l’éditeur officiel ; elle n’empêche pas le fork du **code**.
5. Ne pas mélanger « logiciel libre » et « autorisation d’utiliser le nom / le logo ».

---

## 11. Chemins de crédibilité low-cost (sans faux labels)

| Levier | Coût | Intérêt | Attention |
|---|---|---|---|
| **Expert-comptable bêta-testeur** (contrat de test, pas un « partenariat Ordre ») | 0–500 € ou contrepartie logiciel | FEC, mentions, vocabulaire métier | Ne pas écrire « recommandé par l’Ordre » |
| **Ordre des experts-comptables** | — | Pas un agrément logiciel | Pub du cabinet : art. 152 décret 2012-432 (info utile, pas comparative, pas trompeuse). Comptal ne « labellise » pas un EC. |
| **France Num** | 0 € | Visibilité TPE, [guide logiciel libre](https://www.francenum.gouv.fr/guides-et-conseils/pilotage-de-lentreprise/logiciels-de-gestion-de-lentreprise/guide-du-logiciel) | **Pas** un label d’éditeur de compta |
| **Comptoir du Libre** (ADULLACT) | 0 € | Référencement collectivités | Critères : licence OSI, dépôt public clonable — [comptoir-du-libre.org](https://comptoir-du-libre.org/fr/) ; [critères](https://faq.adullact.org/logiciels/comptoir-du-libre/criteres-ajout-logiciel/). Souvent **trop tôt** tant que ce n’est pas un métier collectivité. |
| **Framasoft / Frama.space / annuaires** | 0 € | Communauté | Pas un tampon fiscal |
| **April / CNLL** | Adhésion associative faible | Veille (l’April a pesé sur le retour de l’attestation 2026) | Lobby, pas certification |
| **SILL** (DINUM) | 0 € | Administrations d’État | Processus agents publics ; **pas** un objectif 12 mois |
| **Adullact « projet structurant »** | Élevé (gouvernance, forge, marchés) | Collectivités | **Trop lourd** au stade actuel |
| **Pépite / statut étudiant-entrepreneur** | 0 € | Si vous êtes étudiant | Sinon hors sujet |
| **Incubateurs locaux / France 2030 / BPI** | Dossier lourd | Aide si **société** + innovation | France 2030 ≠ subvention hobby ; BPI = entreprise. Aides régionales « communs numériques » parfois 50–60 % — [exemple France Num](https://www.francenum.gouv.fr/aides-financieres/aide-linnovation-numerique-responsable) (régional, pas national automatique) |
| **SME Fund (EUIPO/INPI)** | 0 € dossier | Remboursement partiel marques | [INPI SME Fund](https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/deposant-et-cout-dune-marque) |

**Le meilleur ROI :** un cabinet qui **importe vraiment** des CSV Comptal, un README « ce que nous ne sommes pas », un hash de release, une page sources officielles.

---

## 12. Ce qu’il NE FAUT PAS faire

1. Écrire **« certifié / agréé / homologué DGFiP / Bercy / ANC »**.
2. Afficher **NF 525**, **NF 203**, **LNE**, logo **Plateforme agréée** ou **Solution compatible** sans y avoir droit (ce dernier exige le raccordement PA + règles du label DGFiP).
3. Signer une **attestation individuelle** alors que l’ISCA n’est pas dans le code (ou seulement « on a un SQLite »).
4. Laisser un fork / une compilation maison **réutiliser** votre attestation.
5. Promettre que les **reçus** rendent l’association éligible.
6. Présenter le dashboard comme **comptes annuels** (PCG / ANC 2018-06).
7. Dire que Test Compta Demat « **certifie** » Comptal (la notice DGFiP dit l’inverse).
8. Inventer un **n° d’immatriculation PA**.
9. Vendre du support en **dissimulant** le caractère non professionnel du conseil fiscal.
10. Utiliser le nom d’un expert-comptable ou de l’Ordre comme argument publicitaire sans accord **et** hors déontologie.

---

## 13. Étapes numérotées (12–36 mois)

### Phase 0 — Immédiat (0–4 semaines) — palier 0 €

| # | Action | Délai | Coût | Preuve / URL |
|---|---|---|---|---|
| 0.1 | Rédiger la page « Périmètre et non-qualité » (hors champ caisse, pas PA, pas FEC) | 2 j | 0 € | Ce document |
| 0.2 | Choisir le nom d’éditeur affiché (personne physique vs futur SIREN) | 1 j | 0 € | — |
| 0.3 | Publier une **licence** (AGPL recommandée) + copyright | 1 j | 0 € | osi.org ; choosealicense.com |
| 0.4 | Inventaire produit vs mentions facture / Cerfa (écarts) | 3 j | 0 € | [F31808](https://entreprendre.service-public.gouv.fr/vosdroits/F31808) ; Cerfa 11580 sur impots.gouv.fr |

### Phase 1 — Identité (1–3 mois) — palier 0–200 €

| # | Action | Délai | Coût | URL |
|---|---|---|---|---|
| 1.1 | Micro **ou** asso 1901 | 1–4 sem. | 0 € (+ JOAFE si asso, tarif JO) | [formalites.entreprises.gouv.fr](https://formalites.entreprises.gouv.fr/) ; [service-public associations](https://www.service-public.fr/associations) |
| 1.2 | Recherche + dépôt marque « Comptal » 1 classe | 1–2 j dépôt ; ~6 mois enregistrement | **190 €** | [INPI](https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/deposant-et-cout-dune-marque) |
| 1.3 | Releases signées (hash, notes, SBOM léger) | Continu | 0 € | — |
| 1.4 | CGU / disclaimer (pas de conseil fiscal, pas de garantie métier) | 1 sem. | 0–200 € si modèle avocat | — |

### Phase 2 — Conformité du périmètre réel (3–12 mois) — palier 200–2 000 €

| # | Action | Délai | Coût |
|---|---|---|---|
| 2.1 | Audit mentions facture + 4 mentions réforme (selon date d’émission de **l’utilisateur**) | 1–2 mois dev | Temps |
| 2.2 | Export **Factur-X** (minimum) même sans PA | 2–4 mois | Temps ; spec [fnfe-mpe.org](https://fnfe-mpe.org/factur-x/) |
| 2.3 | Verrouillage champ caisse (copy + éventuel garde-fou technique) | 2–4 sem. | Temps |
| 2.4 | Reçus : millésime Cerfa, disclaimer éligibilité, conservation | 2–4 sem. | Temps |
| 2.5 | 4–8 h d’expert-comptable « revue de parcours » (contrat de test) | 1 mois | 400–1 500 € TTC selon cabinet |
| 2.6 | Décision écrite **FEC oui/non** (si non : ne jamais dire « comptabilité ») | 1 j | 0 € |

### Phase 3 — Crédibilité et e-invoicing (12–24 mois) — palier 2 000–10 000 €

| # | Action | Délai | Coût |
|---|---|---|---|
| 3.1 | Contacter 2–3 PA de la **liste du jour** pour une API « logiciel desktop » | 3–6 mois | Intégration 0–5 k€ ; l’utilisateur paie la PA |
| 3.2 | Si label « Solution compatible » : suivre le kit DGFiP, **sans** usurper « Plateforme agréée » | Après 3.1 | Selon PA |
| 3.3 | Chorus Pro seulement si utilisateurs B2G | Optionnel | Connecteur ou export |
| 3.4 | Référencement Comptoir du Libre **si** licence OSI + dépôt public | 1 j | 0 € |
| 3.5 | EURL + RC pro **si** CA / attestations | 1 mois | 1–3 k€ année 1 |

### Phase 4 — Uniquement si pivot « vraie compta » (18–36 mois)

| # | Action | Délai | Coût |
|---|---|---|---|
| 4.1 | Modèle d’écritures, journaux, validation, exercice, RAN | 12+ mois | Temps ++ |
| 4.2 | Export FEC 18 champs + campagne Test Compta Demat | 3–6 mois | 0 € l’outil DGFiP |
| 4.3 | NF 203 | 6–18 mois | Devis Infocert (souvent hors palier 10 k€ tout compris) |
| 4.4 | NF 525 / BYCYB | **Ne pas lancer** sans pivot caisse et budget dédié | 10–30 k€ + annuel |

---

## 14. Risques juridiques (attestation, responsabilité, forks)

| Risque | Texte | Mitigation |
|---|---|---|
| Fausse attestation | C. pén. **441-1** (rappel BOFiP) | Ne signer que si ISCA **démontrable** sur **cette** version |
| Logiciel d’encaissement frauduleux | CGI **1770 undecies** (amende 15 % du CA + solidarité des droits) | Pas de « mode invisible », pas d’outil d’effacement |
| Utilisateur sans justificatif caisse | CGI **1770 duodecies** 7 500 € | Hors champ + documentation ; ne pas pousser le B2C caisse |
| FEC non conforme | CGI **1729 D** 5 000 € / 10 % | Soit pas de FEC, soit FEC testé |
| Reçus indus | Amende = taux de la réduction | Disclaimer ; pas de « bouton magique éligibilité » |
| Fork qui garde le nom / l’attestation | Contrefaçon de marque + tromperie | Marque INPI + licence + versions signées |
| Clause « as is » vs devoir d’éditeur | La licence libre **n’efface pas** une attestation | Séparer clairement : code communautaire vs binaire attesté |
| Conseil fiscal déguisé | Responsabilité civile | « L’utilisateur reste redevable » ; orienter vers EC |
| Publicité trompeuse | Code conso. L. 121-2 et s. | Vocabulaire de la § 12 |

**Open source n’est pas un bouclier.** Le BOFiP traite explicitement le logiciel libre. Soit vous **maîtrisez** une ligne de produits (binaires), soit vous assumez que **chaque compilateur** est un éditeur distinct — et vous **n’attestez pas**.

---

## 15. Roadmap technique minimale liée à l’officialisation

Ne pas réécrire les plans fonctionnels ; **prioriser** ce qui change le statut juridique du produit.

1. **Licence + versioning + hashes** — prérequis de toute preuve.
2. **Positionnement code / UI** — écran de premier lancement : hors champ caisse ; pas PA.
3. **Garde-fous facturation** — mentions 242 nonies A ; numérotation continue (déjà amorcée) ; **unicité SQLite** (le plan directeur note que l’unicité n’est pas encore une contrainte UNIQUE).
4. **Paiements** — documenter / restreindre le B2C espèces pour rester hors 286.
5. **Reçus** — millésime Cerfa ; texte d’éligibilité ; archivage des PDF (déjà registre).
6. **Factur-X** — génération locale (pas d’envoi DGFiP).
7. **Pont PA** — plus tard, hors process, API d’une PA listée.
8. **FEC** — **uniquement** après décision Position C : plan de comptes, journaux, `EcritureNum`, `ValidDate`, clôture, RAN. S’appuyer sur [BOI-CF-IOR-60-40-20](https://bofip.impots.gouv.fr/bofip/10686-PGP) et Test Compta Demat.
9. **Inaltérabilité** — si un jour caisse **ou** compta : pas d’UPDATE silencieux des écritures validées ; corrections par contre-passation ; journal d’audit ; empreinte. Aujourd’hui `transactions.updated_at` autorise l’édition : **incompatible** avec une attestation ISCA ou un FEC « écritures validées ».
10. **Desktop vs PA** — conserver le local-first ; le cloud n’est requis que pour **être** PA, pas pour **parler** à une PA (l’utilisateur a déjà un compte PA).

Les consolidations déjà listées dans `plans/plan-directeur-actuel.md` (schéma, tests, unicité des numéros) sont **préalables** à toute prétention de sérieux, bien avant NF ou FEC.

---

## 16. Budget par palier

Montants TTC indicatifs, France, sept. 2026. Les certifications = **devis**.

### 16.1 Palier **0 €**

- Licence AGPL, README conformité, hashes de release.
- Compte Git public.
- Positionnement hors champ.
- Micro-entreprise **ou** asso (création).
- Test Compta Demat **si** un jour il y a un FEC (outil gratuit ; le rapport n’est pas une certif).
- Candidature Comptoir du Libre / visibilité France Num (guides).

**Livrable :** « projet identifiable et honnête », pas un logiciel « officiel ».

### 16.2 Palier **200 €**

- Tout le 0 €.
- **Marque INPI** 190 € (1 classe).
- Nom de domaine ~10 €/an (hors palier strict, souvent nécessaire).

**Livrable :** nom protégé, éditeur identifiable.

### 16.3 Palier **2 000 €**

- Tout le 200 €.
- 0–400 € CFE / frais bancaires année 2 (micro).
- 500–1 500 € : revue EC + (si possible) 1–2 h avocat clauses licence / disclaimer.
- Temps dev : mentions + Factur-X + disclaimers dons.

**Livrable :** produit **présentable** à un cabinet et à une petite asso, sans label fiscal.

### 16.4 Palier **10 000 €**

- Tout le 2 000 €.
- EURL/SASU + EC + RC pro (~2–4 k€ an 1).
- Intégration **une** PA (négocier un tarif éditeur / sandbox).
- **Pas** de NF 525 complète (souvent le budget **y passerait tout entier**).
- Éventuel pré-audit / formation Infocert **uniquement** si pivot caisse décidé.

**Livrable :** éditeur « réel » + chemin e-invoicing pour les utilisateurs assujettis. Toujours **pas** « agréé DGFiP ».

### 16.5 Au-delà (hors scope particulier pauvre)

| Poste | Ordre de grandeur |
|---|---|
| NF 525 ou BYCYB 1er cycle | 10–30 k€ + 4–6 k€ / an |
| NF 203 | Devis ; souvent même ordre + exigences qualité ISO 25051 / process |
| ISO 27001 (nécessaire PA) | Dizaines de k€ |
| Devenir PA | 100 k€ – plusieurs M€ |

---

## 17. Calendrier réaliste 12–36 mois

| Période | Objectif « officialisation » | Non-objectif |
|---|---|---|
| **M0–M3** | Licence, identité, marque, page vérité | Labels |
| **M3–M12** | Mentions facture, Cerfa, hors champ caisse, 1 EC testeur | FEC, PA, NF |
| **M12–M24** | Factur-X, discussions PA, éventuellement micro→société | Immatriculation PA |
| **M24–M36** | Soit rester trésorerie/asso **crédible** ; soit **décider** le chantier FEC (gros) | « On est dans la liste Bercy » |

La réforme e-invoicing est **déjà en vigueur** au 1er septembre 2026 pour la **réception** (assujettis) et l’émission GE/ETI ; les **PME / micro** ont jusqu’au **1er septembre 2027** pour **émettre**. Les utilisateurs Comptal TPE n’ont donc **pas** besoin que Comptal soit PA en 2026 ; ils ont besoin d’une **PA à côté**, et plus tard d’un export propre.

---

## 18. Annexes

### 18.1 Organismes et textes (URLs, pas de numéros inventés)

**Administration fiscale / facturation**

- DGFiP — Comptabilités informatisées : https://www.impots.gouv.fr/les-comptabilites-informatisees  
  Contact Q/R FEC indiqué par l’administration : `service.cf@dgfip.finances.gouv.fr`
- BOFiP FEC présentation : https://bofip.impots.gouv.fr/bofip/9026-PGP.html/identifiant=BOI-CF-IOR-60-40-10-20211215
- BOFiP caisse (25/03/2026) : https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325
- Modèle attestation : https://bofip.impots.gouv.fr/bofip/10692-PGP.html/identifiant=BOI-LETTRE-000242-20260325
- Actualité rétablissement attestation (art. 125 LF 2026) : https://bofip.impots.gouv.fr/bofip/15035-PGP.html/ACTU-2026-00073
- Loi n° 2026-103 du 19 février 2026 : Journal officiel (Légifrance)
- CGI art. 286, 1770 duodecies, 1770 undecies, 1729 D ; LPF L. 47 A, A. 47 A-1, L. 102 B
- Liste PA : https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees
- Espace PA : https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees
- Immatriculation PA : https://demarche.numerique.gouv.fr/commencer/immatpdp/dossier_vide
- Guide démarrage 1er sept. 2026 : https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/guide_pratique_facturation_electronique.pdf
- Labels PA / solution compatible (PDF) : https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fe_presentation-des-labels.pdf
- Service-Public — réforme au 1er sept. 2026 : https://entreprendre.service-public.gouv.fr/actualites/A18953
- Mentions facture : https://entreprendre.service-public.gouv.fr/vosdroits/F31808
- économie.gouv.fr — caisse : https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/ce-quil-faut-savoir-sur-la-certification-des-logiciels-de-caisse
- Test Compta Demat : https://www.economie.gouv.fr/dgfip/outil-de-test-des-fichiers-des-ecritures-comptables-fec — sources https://github.com/DGFiP/Test-Compta-Demat
- Dons / rescrit : https://www.impots.gouv.fr/professionnel/dons-et-reduction-dimpot  
  Rescrit mécénat (sans espace pro) : https://demarche.numerique.gouv.fr/  
  Fiche Service-Public : https://www.service-public.gouv.fr/particuliers/vosdroits/F34246

**Normes comptables**

- ANC : https://www.anc.gouv.fr/  
  Règlements : https://www.anc.gouv.fr/normes-comptables-francaises/reglements-de-lanc  
  PCG 2026 : https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/recueil/2026/PCG--1er-janvier-2026.pdf

**Certification (qualité / caisse) — contacts publics des sites, sans inventer d’autre numéro**

- Infocert (secrétariat technique NF, NF 525 / NF 203) : https://infocert.org/ — formulaire « Demande de certification » ; courriel publié sur le site : `contact@infocert.org`
- AFNOR Certification — NF Logiciel : https://certification.afnor.org/numerique/nf-logiciel
- LNE : https://www.lne.fr/ — la certification caisse est renvoyée à **BYCYB** : https://www.lne.fr/fr/service/certification/certification-systemes-caisse-bycyb — courriel publié sur les documents BYCYB : `contact@bycyb.com`
- COFRAC (accréditation) : https://www.cofrac.fr/

**Facture électronique (technique / B2G)**

- FNFE-MPE Factur-X : https://fnfe-mpe.org/factur-x/
- Chorus Pro (AIFE) : https://chorus-pro.gouv.fr/
- économie.gouv.fr réforme : https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises

**Éditeur / PI / création**

- Guichet unique : https://formalites.entreprises.gouv.fr/
- INPI marque : https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/deposant-et-cout-dune-marque
- Associations : https://www.service-public.fr/associations  
  JO associations : https://www.journal-officiel.gouv.fr/pages/associations-demarches-associations-loi1901/

**Communauté / orientation (pas des agréments fiscaux)**

- Comptoir du Libre : https://comptoir-du-libre.org/fr/
- ADULLACT : https://adullact.org/
- France Num (guide libre) : https://www.francenum.gouv.fr/guides-et-conseils/pilotage-de-lentreprise/logiciels-de-gestion-de-lentreprise/guide-du-logiciel
- April : https://www.april.org/
- CNLL : https://cnll.fr/
- SILL : https://code.gouv.fr/sill/

### 18.2 Contacts types (modèles, à adapter)

**DGFiP (question de doctrine, pas un « agrément Comptal »)**  
Objet : clarification de champ d’application — logiciel de trésorerie / facturation desktop sans fonctionnalité de caisse.  
Voie : messagerie de l’espace professionnel, ou pour le FEC `service.cf@dgfip.finances.gouv.fr` (adresse publiée sur impots.gouv.fr).  
Ne pas demander « inscrivez-nous sur une liste de logiciels de compta ».

**Infocert / BYCYB**  
Uniquement **après** décision d’entrer dans le champ caisse ou NF 203. Demander un **questionnaire + devis**, préciser open source / versions / desktop hors cloud.

**ANC**  
Pour des questions de **norme** (PCG, asso 2018-06), pas pour certifier un binaire. Formulaire / contact via https://www.anc.gouv.fr/

**Plateforme agréée (partenariat technique)**  
« Comptal2.1 est un client lourd local. Nous cherchons un raccordement API pour que **l’utilisateur** transmette ses factures via **votre** immatriculation. Nous n’utiliserons pas la marque Plateforme agréée. Merci de confirmer votre présence sur le fichier DGFiP du [date]. »

**Expert-comptable bêta**  
« Mission de test logiciel (pas un audit d’entreprise). Livrable : liste d’écarts FEC / mentions / vocabulaire. Interdiction réciproque d’utiliser le nom de l’Ordre ou du cabinet comme label sans accord écrit. »

### 18.3 Glossaire express

| Sigle | Sens utile ici |
|---|---|
| **PA** | Plateforme agréée (ex-PDP), immatriculée DGFiP |
| **PPF** | Portail public de facturation (annuaire + concentrateur, plus la facture B2B) |
| **PDP** | Ancien nom de la PA |
| **FEC** | Fichier des écritures comptables, pour le **contrôle** |
| **ISCA** | Inaltérabilité, Sécurisation, Conservation, Archivage (caisse) |
| **NF 525** | Marque NF **caisse**, Infocert / AFNOR |
| **NF 203** | Marque NF **logiciel / compta informatisée**, volontaire |
| **Cerfa 11580** | Modèle de reçu fiscal (2041-RD) |

---

*Fin du plan. Toute évolution législative postérieure à septembre 2026 (BOFiP, liste PA, millésime Cerfa) doit être revérifiée sur les URL officielles ci-dessus avant communication publique.*
