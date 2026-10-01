#!/usr/bin/env python3
"""Crée un profil SQLite de développement complet pour Comptal2.1.

Usage:
  python3 scripts/create-dev-database.py
  python3 scripts/create-dev-database.py --force --activate
  python3 scripts/create-dev-database.py --profile-id mon_profil --force
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = APP_ROOT / "data"
DEFAULT_PROFILE_ID = "profile_developpement"
NOW = "2026-09-01T06:00:00.000Z"

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4a90e2',
  initial_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date_start TEXT,
  date_end TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value_date TEXT,
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  category_code TEXT,
  import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX idx_tx_account_date ON transactions(account_id, date);
CREATE INDEX idx_tx_date ON transactions(date);
CREATE INDEX idx_tx_category ON transactions(category_code);
CREATE TABLE autocat_stats (
  word TEXT NOT NULL,
  category_code TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (word, category_code)
);
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  initial_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  widget_layout TEXT
);
CREATE TABLE project_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('debit','credit')),
  amount REAL NOT NULL,
  periodicity TEXT NOT NULL DEFAULT 'monthly',
  start_date TEXT NOT NULL,
  category_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  parent_id INTEGER,
  is_group INTEGER NOT NULL DEFAULT 0,
  end_date TEXT,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_project_subs_project ON project_subscriptions(project_id);
CREATE INDEX idx_project_subs_parent ON project_subscriptions(parent_id);
CREATE TABLE import_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  initial_balance REAL,
  column_roles_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE TABLE invoice_emetteur (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);
CREATE TABLE invoice_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);
CREATE TABLE pdf_templates (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
CREATE TABLE legal_mentions (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  code_client TEXT,
  type TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE devis (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  numero TEXT NOT NULL,
  statut TEXT NOT NULL,
  supprime INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE factures (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  numero TEXT NOT NULL,
  statut TEXT NOT NULL,
  devis_origine TEXT,
  supprime INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE postes_catalogue (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'facturation',
  payload TEXT NOT NULL
);
CREATE TABLE postes_groupes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'facturation',
  payload TEXT NOT NULL
);
CREATE TABLE secteurs_activite (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
CREATE TABLE association_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);
CREATE TABLE donateurs (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE donateur_transactions (
  transaction_id TEXT PRIMARY KEY,
  donateur_id TEXT NOT NULL
);
CREATE TABLE dons_manuels (
  id TEXT PRIMARY KEY,
  donateur_id TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE registre_recus (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
CREATE TABLE donations (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  anonymous INTEGER NOT NULL DEFAULT 0 CHECK(anonymous IN (0,1)),
  donor_label TEXT,
  source TEXT NOT NULL CHECK(source IN ('manuel','transaction')),
  transaction_id TEXT UNIQUE,
  nature TEXT NOT NULL CHECK(nature IN ('numeraire','nature','mecenat_competences')),
  payment_method TEXT,
  amount REAL NOT NULL CHECK(amount > 0),
  donation_date TEXT NOT NULL,
  received_date TEXT,
  description TEXT,
  valuation_method TEXT,
  valuation_by_donor INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  receipt_eligible INTEGER NOT NULL DEFAULT 1,
  receipt_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((anonymous = 1 AND contact_id IS NULL) OR (anonymous = 0 AND contact_id IS NOT NULL))
);
CREATE TABLE donation_rules (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  label_contains TEXT NOT NULL DEFAULT '',
  category_code TEXT,
  payment_method TEXT NOT NULL DEFAULT 'virement',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_donations_date ON donations(donation_date DESC);
CREATE INDEX idx_donations_contact ON donations(contact_id);
CREATE INDEX idx_donations_receipt ON donations(receipt_id);
CREATE INDEX idx_donation_rules_contact ON donation_rules(contact_id);
CREATE INDEX idx_devis_client ON devis(client_id);
CREATE INDEX idx_factures_client ON factures(client_id);
CREATE INDEX idx_devis_numero ON devis(numero);
CREATE INDEX idx_factures_numero ON factures(numero);
CREATE INDEX idx_postes_kind ON postes_catalogue(kind);
CREATE INDEX idx_groupes_kind ON postes_groupes(kind);
CREATE TABLE contact_groups (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE register_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);
CREATE TABLE register_documents (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('reference','invoice_summary','cashflow_summary')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','archived')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL,
  pdf_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE register_items (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES register_documents(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount REAL,
  created_at TEXT NOT NULL
);
CREATE TABLE register_links (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES register_documents(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE register_attachments (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES register_documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_register_documents_created ON register_documents(created_at DESC);
CREATE INDEX idx_register_items_document ON register_items(document_id);
CREATE INDEX idx_register_links_document ON register_links(document_id);
CREATE INDEX idx_register_attachments_document ON register_attachments(document_id);

CREATE TABLE micro_enterprise_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);
CREATE TABLE micro_receipts (
  id TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL UNIQUE CHECK(sequence > 0),
  received_date TEXT NOT NULL,
  client_name TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount != 0),
  payment_method TEXT NOT NULL CHECK(payment_method IN (
    'virement','cheque','especes','cb','prelevement','autre'
  )),
  invoice_id TEXT,
  invoice_number TEXT,
  transaction_id TEXT,
  source_payment_id TEXT UNIQUE,
  reference TEXT,
  source TEXT NOT NULL CHECK(source IN ('invoice_payment','manual','reversal')),
  reverses_id TEXT REFERENCES micro_receipts(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_micro_receipts_date ON micro_receipts(received_date, sequence);
CREATE INDEX idx_micro_receipts_invoice ON micro_receipts(invoice_id);
CREATE INDEX idx_micro_receipts_transaction ON micro_receipts(transaction_id);
CREATE TRIGGER micro_receipts_no_update
  BEFORE UPDATE ON micro_receipts
  BEGIN
    SELECT RAISE(ABORT, 'Le livre des recettes est inaltérable');
  END;
CREATE TRIGGER micro_receipts_no_delete
  BEFORE DELETE ON micro_receipts
  BEGIN
    SELECT RAISE(ABORT, 'Le livre des recettes est inaltérable');
  END;

PRAGMA user_version = 18;
"""


def json_text(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def iso(date: str) -> str:
    return f"{date}T12:00:00.000Z"


def document_base(
    *,
    document_id: str,
    number: str,
    client_id: str,
    issue_date: str,
    due_date: str,
    lines: list[dict[str, object]],
    total_ht: float,
    total_vat: float,
    total_ttc: float,
    status: str,
) -> dict[str, object]:
    return {
        "id": document_id,
        "numero": number,
        "clientId": client_id,
        "dateEmission": iso(issue_date),
        "dateEcheance": iso(due_date),
        "postes": lines,
        "vendeur": {
            "denominationSociale": "Comptal Développement SAS",
            "formeJuridique": "SAS",
            "adresse": {
                "rue": "10 rue des Tests",
                "codePostal": "75002",
                "ville": "Paris",
                "pays": "France",
            },
            "siren": "732829320",
            "siret": "73282932000074",
            "numeroTVA": "FR09732829320",
            "capitalSocial": 10000,
            "rcs": "Paris B 732 829 320",
        },
        "totalHT": total_ht,
        "totalTVA": {"20": total_vat},
        "totalTTC": total_ttc,
        "conditionsPaiement": "Paiement à 30 jours",
        "mentionsLegales": "Indemnité forfaitaire de recouvrement : 40 €.",
        "notes": "Donnée fictive réservée aux tests.",
        "statut": status,
        "createdAt": iso(issue_date),
        "updatedAt": NOW,
    }


def _load_singleton(connection: sqlite3.Connection, table: str) -> dict[str, object]:
    raw = connection.execute(f"SELECT payload FROM {table} WHERE id = 1").fetchone()[0]
    return json.loads(raw)


def _save_singleton(connection: sqlite3.Connection, table: str, payload: dict[str, object]) -> None:
    connection.execute(
        f"UPDATE {table} SET payload = ? WHERE id = 1",
        (json_text(payload),),
    )


def enrich_for_kind(
    connection: sqlite3.Connection,
    kind: str,
    account_ids: dict[str, int],
) -> None:
    """Complète le jeu mixte pour un scénario entreprise ou association.

    Le kind ``mixte`` reste inchangé : c’est le contrat des tests automatisés.
    """
    if kind == "mixte":
        return

    if kind == "micro":
        emetteur = _load_singleton(connection, "invoice_emetteur")
        emetteur.update(
            {
                "type": "auto_entrepreneur",
                "denominationSociale": "Léopaul VOGT EI",
                "formeJuridique": "EI",
                "numeroTVA": "",
                "regimeTVA": "franchise",
                "regimeFiscal": "micro_bnc",
                "mentionFranchiseTVA": "TVA non applicable, art. 293 B du CGI",
            }
        )
        _save_singleton(connection, "invoice_emetteur", emetteur)
        invoice_settings = _load_singleton(connection, "invoice_settings")
        invoice_settings["tauxTVADefaut"] = 0
        _save_singleton(connection, "invoice_settings", invoice_settings)
        config = {
            "enabled": True,
            "businessStartDate": "2026-10-01",
            "fiscalYear": 2026,
            "regimeFiscal": "micro_bnc",
            "declarationFrequency": "quarterly",
            "versementLiberatoire": False,
            "socialRate": 25.6,
            "trainingRate": 0.2,
            "incomeTaxRate": 2.2,
            "microThreshold": 83600,
            "vatBaseThreshold": 37500,
            "vatToleranceThreshold": 41250,
            "estimatedMonthlyToolsCost": 40,
        }
        connection.execute(
            "INSERT INTO micro_enterprise_config (id, payload) VALUES (1, ?)",
            (json_text(config),),
        )
        for code, name, color in (
            ("RECETTES_PRO", "Recettes professionnelles", "#16a34a"),
            ("COTISATIONS", "Cotisations sociales", "#dc2626"),
            ("CFP", "Contribution formation professionnelle", "#ea580c"),
            ("CFE", "Cotisation foncière des entreprises", "#7c3aed"),
            ("OUTILS", "Outils et abonnements", "#2563eb"),
        ):
            connection.execute(
                "INSERT OR IGNORE INTO categories (code, name, color) VALUES (?, ?, ?)",
                (code, name, color),
            )
        invoice_rows = connection.execute("SELECT id, payload FROM factures").fetchall()
        first_payment: tuple[str, dict[str, object], dict[str, object]] | None = None
        for invoice_id, raw in invoice_rows:
            invoice = json.loads(raw)
            invoice["vendeur"] = {
                **invoice.get("vendeur", {}),
                "type": "auto_entrepreneur",
                "denominationSociale": "Léopaul VOGT EI",
                "formeJuridique": "EI",
                "numeroTVA": "",
                "regimeTVA": "franchise",
                "mentionFranchiseTVA": "TVA non applicable, art. 293 B du CGI",
            }
            for line in invoice.get("postes", []):
                line["tauxTVA"] = 0
            invoice["totalTVA"] = {"0": 0}
            invoice["totalTTC"] = invoice.get("totalHT", invoice.get("totalTTC", 0))
            connection.execute(
                "UPDATE factures SET payload = ? WHERE id = ?",
                (json_text(invoice), invoice_id),
            )
            payments = invoice.get("paiements", [])
            if first_payment is None and payments:
                first_payment = (invoice_id, invoice, payments[0])
        if first_payment:
            invoice_id, invoice, payment = first_payment
            connection.execute(
                """INSERT INTO micro_receipts
                   (id, sequence, received_date, client_name, description, amount,
                    payment_method, invoice_id, invoice_number, transaction_id,
                    source_payment_id, reference, source, created_at)
                   VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'invoice_payment', ?)""",
                (
                    "micro-rec-fixture-1",
                    str(payment.get("datePaiement", "2026-06-15"))[:10],
                    "Client de démonstration",
                    "Prestation informatique de démonstration",
                    payment.get("montant", 0),
                    payment.get("modePaiement", "virement"),
                    invoice_id,
                    invoice.get("numero", ""),
                    payment.get("transactionId"),
                    payment.get("id", "fixture-payment"),
                    payment.get("reference"),
                    NOW,
                ),
            )
        connection.execute(
            """INSERT INTO micro_receipts
               (id, sequence, received_date, client_name, description, amount,
                payment_method, reference, source, created_at)
               VALUES (?, 2, ?, ?, ?, ?, ?, ?, 'manual', ?)""",
            (
                "micro-rec-fixture-2",
                "2026-07-03",
                "Client comptant",
                "Assistance administrative ponctuelle",
                95,
                "cb",
                "REC-MANUELLE-001",
                NOW,
            ),
        )
        return

    if kind == "entreprise":
        client = {
            "id": "cli_agence_creative",
            "roles": ["client"],
            "codeClient": "AC001",
            "type": "entreprise",
            "color": "#8b5cf6",
            "denominationSociale": "Agence Créative",
            "formeJuridique": "SARL",
            "siren": "552032534",
            "siret": "55203253400017",
            "email": "compta@agence-creative.example",
            "telephone": "01 44 00 11 22",
            "groupeId": "grp_clients",
            "adresseFacturation": {
                "rue": "14 rue du Faubourg-Saint-Antoine",
                "codePostal": "75012",
                "ville": "Paris",
                "pays": "France",
            },
            "notes": "Client fictif — acompte déjà encaissé, solde à facturer.",
            "createdAt": NOW,
            "updatedAt": NOW,
        }
        connection.execute(
            """INSERT INTO clients (id, code_client, type, archived, payload, updated_at)
               VALUES (?, ?, ?, 0, ?, ?)""",
            (client["id"], client["codeClient"], client["type"], json_text(client), NOW),
        )
        service_line = {
            "id": "poste_campagne",
            "type": "travail",
            "designation": "Campagne de communication",
            "description": "Prestation fictive restante après acompte",
            "tauxHoraire": 90,
            "heuresEstimees": 20,
            "nombreIntervenants": 1,
            "tauxTVA": 20,
            "secteursIds": ["secteur_conseil"],
        }
        quote = document_base(
            document_id="devis_2026_0002",
            number="DEVIS-2026-0002",
            client_id="cli_agence_creative",
            issue_date="2026-02-02",
            due_date="2026-03-04",
            lines=[service_line],
            total_ht=1800,
            total_vat=360,
            total_ttc=2160,
            status="envoye",
        )
        quote.update({"documentType": "devis", "dateValidite": iso("2026-03-04")})
        overdue = document_base(
            document_id="facture_2026_0002",
            number="FAC-2026-0002",
            client_id="cli_techsolutions",
            issue_date="2026-06-10",
            due_date="2026-07-10",
            lines=[service_line],
            total_ht=1800,
            total_vat=360,
            total_ttc=2160,
            status="en_retard",
        )
        overdue.update({"documentType": "facture", "devisOrigine": None, "paiements": []})
        connection.execute(
            """INSERT INTO devis (id, client_id, numero, statut, supprime, payload, updated_at)
               VALUES (?, ?, ?, ?, 0, ?, ?)""",
            (quote["id"], quote["clientId"], quote["numero"], quote["statut"], json_text(quote), NOW),
        )
        connection.execute(
            """INSERT INTO factures
               (id, client_id, numero, statut, devis_origine, supprime, payload, updated_at)
               VALUES (?, ?, ?, ?, NULL, 0, ?, ?)""",
            (overdue["id"], overdue["clientId"], overdue["numero"], overdue["statut"], json_text(overdue), NOW),
        )
        settings = _load_singleton(connection, "invoice_settings")
        settings["prochainNumeroDevis"] = 4
        settings["prochainNumeroFacture"] = 3
        _save_singleton(connection, "invoice_settings", settings)
        extra_tx = [
            ("CC", "2026-07-22", -420.00, 0.00, "Cotisation expert-comptable", "FRAIS"),
            ("CC", "2026-08-12", -890.00, 0.00, "Achat ordinateur portable", "FOUR"),
        ]
        for account, date, debit, credit, label, category in extra_tx:
            connection.execute(
                """INSERT INTO transactions
                   (account_id, date, value_date, debit, credit, label, category_code, import_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, NULL)""",
                (account_ids[account], date, date, debit, credit, label, category),
            )
        return

    emetteur = _load_singleton(connection, "invoice_emetteur")
    emetteur.update(
        {
            "id": "emit_association_test",
            "type": "association",
            "denominationSociale": "Association Comptal Solidarité",
            "formeJuridique": "Association loi 1901",
            "rna": "W691234567",
            "siren": "810123456",
            "siret": "81012345600017",
            "numeroTVA": "",
            "codeNAF": "9499Z",
            "rcs": "",
            "capitalSocial": 0,
            "adresse": {
                "rue": "18 rue des Oliviers",
                "codePostal": "69003",
                "ville": "Lyon",
                "pays": "France",
            },
            "telephone": "04 78 00 00 00",
            "email": "contact@comptal-solidarite.fr",
            "siteWeb": "https://comptal-solidarite.fr",
            "couleurPrincipale": "#0f766e",
            "coordonneesBancaires": {
                "titulaire": "Association Comptal Solidarité",
                "iban": "FR7610096000301234567890185",
                "bic": "CMCIFRPP",
                "banque": "Crédit Mutuel",
            },
            "regimeTVA": "franchise",
            "regimeFiscal": "reel_simplifie",
            "linkedAccounts": [
                {"accountCode": "CC", "accountName": "Compte courant professionnel", "isPrimary": True}
            ],
        }
    )
    _save_singleton(connection, "invoice_emetteur", emetteur)

    association = _load_singleton(connection, "association_config")
    association.update(
        {
            "denominationSociale": "Association Comptal Solidarité",
            "objetSocial": "Soutien éducatif, culturel et d’insertion auprès des publics éloignés.",
            "rna": "W691234567",
            "siren": "810123456",
            "siret": "81012345600017",
            "formeJuridique": "Association loi 1901",
            "adresse": {
                "rue": "18 rue des Oliviers",
                "codePostal": "69003",
                "ville": "Lyon",
                "pays": "France",
            },
            "telephone": "04 78 00 00 00",
            "email": "contact@comptal-solidarite.fr",
            "siteWeb": "https://comptal-solidarite.fr",
            "statutOIG": True,
            "datePublicationJO": "2022-03-12",
            "dateCreation": "2014-05-20",
            "prefectureDeclaration": "Préfecture du Rhône",
            "numeroRecepisse": "W691234567-REC",
            "referencesCGI": "Articles 200 et 238 bis du code général des impôts",
            "signataireNom": "Marie Lefèvre",
            "signataireQualite": "Présidente",
        }
    )
    _save_singleton(connection, "association_config", association)

    connection.execute(
        "UPDATE accounts SET name = ? WHERE code = ?",
        ("Compte courant associatif", "CC"),
    )
    connection.execute(
        "UPDATE accounts SET name = ? WHERE code = ?",
        ("Réserve projet éducatif", "EP"),
    )

    extra_tx = [
        ("CC", "2026-02-18", 0.00, 3500.00, "Subvention Mairie de Lyon", "REV"),
        ("CC", "2026-03-12", 0.00, 640.00, "Cotisations adhérents T1", "DONS"),
        ("CC", "2026-05-02", -380.00, 0.00, "Achat matériel ateliers", "FOUR"),
        ("CC", "2026-07-08", 0.00, 1200.00, "Subvention CAF", "REV"),
        ("CC", "2026-08-19", -95.00, 0.00, "Frais assemblée générale", "REPAS"),
    ]
    for account, date, debit, credit, label, category in extra_tx:
        connection.execute(
            """INSERT INTO transactions
               (account_id, date, value_date, debit, credit, label, category_code, import_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL)""",
            (account_ids[account], date, date, debit, credit, label, category),
        )

    mecenat_contact = {
        "id": "cli_atelier_solaire",
        "roles": ["donateur"],
        "codeClient": "AS001",
        "type": "entreprise",
        "color": "#f59e0b",
        "denominationSociale": "Atelier Solaire",
        "formeJuridique": "SAS",
        "siren": "832111000",
        "siret": "83211100000021",
        "email": "mecenat@atelier-solaire.fr",
        "adresseFacturation": {
            "rue": "9 rue de la Soie",
            "codePostal": "69100",
            "ville": "Villeurbanne",
            "pays": "France",
        },
        "notes": "Mécène fictif — compétences et numéraire.",
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    connection.execute(
        """INSERT INTO clients (id, code_client, type, archived, payload, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)""",
        (
            mecenat_contact["id"],
            mecenat_contact["codeClient"],
            mecenat_contact["type"],
            json_text(mecenat_contact),
            NOW,
        ),
    )
    connection.execute(
        """INSERT INTO donations
          (id, contact_id, anonymous, donor_label, source, transaction_id, nature,
           payment_method, amount, donation_date, received_date, description,
           valuation_method, valuation_by_donor, notes, receipt_eligible, receipt_id,
           created_at, updated_at)
         VALUES (?, ?, 0, NULL, 'manuel', NULL, 'mecenat_competences', NULL, ?, ?, ?, ?, ?, 1, NULL, 1, NULL, ?, ?)""",
        (
            "don_mecenat_solaire",
            mecenat_contact["id"],
            800,
            "2026-07-14",
            "2026-07-14",
            "Mise à disposition d’un développeur, 2 jours",
            "Coût de revient salarial",
            NOW,
            NOW,
        ),
    )


def seed_database(
    connection: sqlite3.Connection,
    profile_id: str,
    kind: str = "mixte",
) -> dict[str, int]:
    if kind not in {"mixte", "entreprise", "association", "micro"}:
        raise ValueError(f"kind invalide: {kind}")
    connection.executescript(SCHEMA_SQL)

    accounts = [
        ("CC", "Compte courant professionnel", "#2563eb", 8500.00),
        ("EP", "Épargne de sécurité", "#16a34a", 25000.00),
        ("CB", "Carte bancaire", "#f97316", 0.00),
    ]
    connection.executemany(
        "INSERT INTO accounts (code, name, color, initial_balance) VALUES (?, ?, ?, ?)",
        accounts,
    )
    account_ids = {
        code: row_id
        for row_id, code in connection.execute("SELECT id, code FROM accounts")
    }

    categories = [
        ("REV", "Revenus clients", "#16a34a"),
        ("LOYER", "Loyer et charges", "#7c3aed"),
        ("SAL", "Salaires", "#2563eb"),
        ("FOUR", "Fournitures", "#f59e0b"),
        ("TRANS", "Transport", "#0891b2"),
        ("REPAS", "Repas professionnels", "#dc2626"),
        ("DONS", "Dons reçus", "#db2777"),
        ("FRAIS", "Frais bancaires", "#64748b"),
        ("X", "Hors statistiques", "#111827"),
        ("Y", "Transferts internes", "#94a3b8"),
    ]
    connection.executemany(
        "INSERT INTO categories (code, name, color) VALUES (?, ?, ?)", categories
    )

    imports = [
        ("releve-cc-2026-01-06.csv", account_ids["CC"], "2026-01-01", "2026-06-30", 13),
        ("releve-cb-2026-s1.xlsx", account_ids["CB"], "2026-01-01", "2026-06-30", 4),
    ]
    connection.executemany(
        """INSERT INTO imports (filename, account_id, date_start, date_end, row_count)
           VALUES (?, ?, ?, ?, ?)""",
        imports,
    )
    import_ids = {
        filename: row_id
        for row_id, filename in connection.execute("SELECT id, filename FROM imports")
    }

    transactions = [
        ("CC", "2026-01-05", -1200.00, 0.00, "Loyer bureau janvier", "LOYER"),
        ("CC", "2026-01-10", 0.00, 1800.00, "Virement facture FAC-DEVIS-2026-0001-01", "REV"),
        ("CB", "2026-01-15", -320.40, 0.00, "Papeterie centrale", "FOUR"),
        ("CC", "2026-02-05", -1200.00, 0.00, "Loyer bureau février", "LOYER"),
        ("CC", "2026-02-12", 0.00, 2800.00, "Acompte Agence Créative", "REV"),
        ("CB", "2026-02-20", -85.20, 0.00, "Restaurant client", "REPAS"),
        ("CC", "2026-03-01", -5000.00, 0.00, "Virement vers épargne", "Y"),
        ("EP", "2026-03-01", 0.00, 5000.00, "Virement depuis compte courant", "Y"),
        ("CC", "2026-03-05", -1200.00, 0.00, "Loyer bureau mars", "LOYER"),
        ("CC", "2026-03-08", -4500.00, 0.00, "Salaires mars", "SAL"),
        ("CC", "2026-03-18", 0.00, 1500.00, "Prestation Martin Dupont", "REV"),
        ("CB", "2026-03-22", -45.00, 0.00, "Pass transport", "TRANS"),
        ("CC", "2026-04-05", -1200.00, 0.00, "Loyer bureau avril", "LOYER"),
        ("CC", "2026-04-14", 0.00, 1200.00, "Don Fondation Exemple", "DONS"),
        ("CC", "2026-04-25", -18.50, 0.00, "Frais tenue de compte", "FRAIS"),
        ("CC", "2026-05-05", -1200.00, 0.00, "Loyer bureau mai", "LOYER"),
        ("CC", "2026-05-14", 0.00, 6200.00, "Virement Tech Solutions", "REV"),
        ("CB", "2026-05-20", -129.90, 0.00, "Fournitures atelier", "FOUR"),
        ("CC", "2026-06-05", -1200.00, 0.00, "Loyer bureau juin", "LOYER"),
        ("CC", "2026-06-18", 0.00, 800.00, "Don Alice Martin", "DONS"),
        ("CC", "2026-06-25", -190.00, 0.00, "Déplacement rendez-vous", "TRANS"),
        ("CB", "2026-06-28", -64.30, 0.00, "Repas équipe", "REPAS"),
        ("CC", "2026-07-05", -1200.00, 0.00, "Loyer bureau juillet", "LOYER"),
        ("CC", "2026-07-15", 0.00, 3600.00, "Facture client juillet", "REV"),
        ("CC", "2026-08-05", -1200.00, 0.00, "Loyer bureau août", "LOYER"),
        ("CC", "2026-08-22", -250.00, 0.00, "Écriture exclue des statistiques", "X"),
        ("CC", "2026-09-01", -1200.00, 0.00, "Loyer bureau septembre", "LOYER"),
        ("CC", "2026-09-01", 0.00, 950.00, "Encaissement non catégorisé", None),
    ]
    insert_transaction = """
      INSERT INTO transactions
        (account_id, date, value_date, debit, credit, label, category_code, import_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    for index, (account, date, debit, credit, label, category) in enumerate(transactions):
        import_id = None
        if index < 18 and account in ("CC", "CB"):
            key = "releve-cb-2026-s1.xlsx" if account == "CB" else "releve-cc-2026-01-06.csv"
            import_id = import_ids[key]
        connection.execute(
            insert_transaction,
            (account_ids[account], date, date, debit, credit, label, category, import_id),
        )

    connection.executemany(
        "INSERT INTO autocat_stats (word, category_code, count) VALUES (?, ?, ?)",
        [
            ("loyer", "LOYER", 9),
            ("bureau", "LOYER", 7),
            ("fournitures", "FOUR", 4),
            ("restaurant", "REPAS", 3),
            ("transport", "TRANS", 4),
            ("facture", "REV", 8),
        ],
    )
    connection.execute(
        """INSERT INTO import_templates
           (name, account_id, initial_balance, column_roles_json, updated_at)
           VALUES (?, ?, ?, ?, ?)""",
        (
            "Relevé bancaire standard",
            account_ids["CC"],
            8500.00,
            json_text(
                {
                    "Date": "date",
                    "Date de valeur": "valueDate",
                    "Libellé": "label",
                    "Montant": "debitCredit",
                }
            ),
            NOW,
        ),
    )

    widget_layout = {
        "chartGranularity": "month",
        "splitRatio": 0.58,
        "columns": ["name", "group", "type", "amount", "periodicity", "startDate", "endDate"],
        "columnWidths": {},
        "widgets": [
            {"id": "stats", "type": "stats", "enabled": True, "order": 0},
            {"id": "balance", "type": "balance", "enabled": True, "order": 1},
            {"id": "debitCredit", "type": "debitCredit", "enabled": True, "order": 2},
            {"id": "category", "type": "category", "enabled": True, "order": 3},
            {"id": "lines", "type": "lines", "enabled": True, "order": 4},
        ],
    }
    project_id = connection.execute(
        """INSERT INTO projects
           (name, start_date, end_date, initial_balance, updated_at, widget_layout)
           VALUES (?, ?, ?, ?, ?, ?)""",
        ("Prévision 2027", "2027-01-01", "2027-12-31", 18000.00, NOW, json_text(widget_layout)),
    ).lastrowid
    group_id = connection.execute(
        """INSERT INTO project_subscriptions
           (project_id, name, type, amount, periodicity, start_date, end_date,
            category_code, color, parent_id, is_group, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (project_id, "Charges fixes", "debit", 0, "monthly", "2027-01-01", "2027-12-31",
         None, "#7c3aed", None, 1, 0),
    ).lastrowid
    forecast_rows = [
        ("Loyer", "debit", 1200.00, "monthly", "LOYER", "#7c3aed", group_id, 0, 1),
        ("Salaires", "debit", 4500.00, "monthly", "SAL", "#2563eb", group_id, 0, 2),
        ("Contrats récurrents", "credit", 7200.00, "monthly", "REV", "#16a34a", None, 0, 3),
        ("Prime annuelle", "credit", 5000.00, "yearly", "REV", "#22c55e", None, 0, 4),
    ]
    connection.executemany(
        """INSERT INTO project_subscriptions
           (project_id, name, type, amount, periodicity, start_date, end_date,
            category_code, color, parent_id, is_group, sort_order)
           VALUES (?, ?, ?, ?, ?, '2027-01-01', '2027-12-31', ?, ?, ?, ?, ?)""",
        [(project_id, *row) for row in forecast_rows],
    )

    emetteur = {
        "id": "emit_developpement",
        "type": "entreprise",
        "denominationSociale": "Comptal Développement SAS",
        "formeJuridique": "SAS",
        "siren": "732829320",
        "siret": "73282932000074",
        "numeroTVA": "FR09732829320",
        "codeNAF": "6201Z",
        "rcs": "Paris B 732 829 320",
        "capitalSocial": 10000,
        "adresse": {
            "rue": "10 rue des Tests",
            "codePostal": "75002",
            "ville": "Paris",
            "pays": "France",
        },
        "telephone": "01 42 00 00 00",
        "email": "dev@example.test",
        "siteWeb": "https://example.test",
        "couleurPrincipale": "#2563eb",
        "coordonneesBancaires": {
            "titulaire": "Comptal Développement SAS",
            "iban": "FR7630006000011234567890189",
            "bic": "BNPAFRPP",
            "banque": "Banque de test",
        },
        "regimeTVA": "reel_simplifie",
        "regimeFiscal": "is",
        "linkedAccounts": [
            {"accountCode": "CC", "accountName": "Compte courant professionnel", "isPrimary": True}
        ],
        "selectedMentionsLegales": ["mention_penalites"],
        "customMentionsLegales": [],
        "mentionPlaceholderValues": {},
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    invoice_settings = {
        "prefixeDevis": "DEVIS",
        "prefixeFacture": "FAC",
        "formatNumero": "{PREFIX}-{YEAR}-{SEQ:4}",
        "prochainNumeroDevis": 3,
        "prochainNumeroFacture": 2,
        "tauxTVADefaut": 20,
        "delaiPaiementDefaut": 30,
        "conditionsPaiementDefaut": "Paiement à 30 jours",
        "mentionsPenalitesRetard": "Pénalités de retard exigibles en cas de non-paiement",
        "mentionIndemniteRecouvrement": "Indemnité forfaitaire de recouvrement : 40 € (B2B)",
    }
    connection.execute("INSERT INTO invoice_emetteur (id, payload) VALUES (1, ?)", (json_text(emetteur),))
    connection.execute("INSERT INTO invoice_settings (id, payload) VALUES (1, ?)", (json_text(invoice_settings),))

    group = {"id": "grp_clients", "nom": "Clients actifs", "createdAt": NOW, "updatedAt": NOW}
    connection.execute(
        "INSERT INTO contact_groups (id, payload, updated_at) VALUES (?, ?, ?)",
        (group["id"], json_text(group), NOW),
    )
    clients = [
        {
            "id": "cli_techsolutions",
            "roles": ["client"],
            "codeClient": "TE001",
            "type": "entreprise",
            "color": "#0ea5e9",
            "denominationSociale": "Tech Solutions SAS",
            "formeJuridique": "SAS",
            "siren": "443061841",
            "siret": "44306184100047",
            "email": "facturation@techsolutions.example",
            "telephone": "01 55 12 34 56",
            "groupeId": "grp_clients",
            "adresseFacturation": {
                "rue": "25 avenue des Champs-Élysées",
                "codePostal": "75008",
                "ville": "Paris",
                "pays": "France",
            },
            "notes": "Contact fictif de développement.",
            "createdAt": NOW,
            "updatedAt": NOW,
        },
        {
            "id": "cli_martin",
            "roles": ["client", "donateur"],
            "codeClient": "MA001",
            "type": "particulier",
            "color": "#8b5cf6",
            "civilite": "Mme",
            "nom": "Martin",
            "prenom": "Alice",
            "email": "alice.martin@example.test",
            "groupeId": "grp_clients",
            "adresseFacturation": {
                "rue": "8 rue Victor-Hugo",
                "codePostal": "69002",
                "ville": "Lyon",
                "pays": "France",
            },
            "createdAt": NOW,
            "updatedAt": NOW,
        },
    ]
    connection.executemany(
        """INSERT INTO clients (id, code_client, type, archived, payload, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)""",
        [(client["id"], client["codeClient"], client["type"], json_text(client), NOW) for client in clients],
    )

    service_line = {
        "id": "poste_audit",
        "type": "travail",
        "designation": "Audit et accompagnement",
        "description": "Prestation fictive pour les tests",
        "tauxHoraire": 100,
        "heuresEstimees": 10,
        "nombreIntervenants": 1,
        "tauxTVA": 20,
        "secteursIds": ["secteur_conseil"],
    }
    material_line = {
        "id": "poste_licence",
        "type": "materiel",
        "designation": "Licence annuelle",
        "prixUnitaireHT": 500,
        "tauxTVA": 20,
        "quantite": 1,
        "unite": "forfait",
    }
    connection.executemany(
        "INSERT INTO postes_catalogue (id, kind, payload) VALUES (?, 'facturation', ?)",
        [(service_line["id"], json_text(service_line)), (material_line["id"], json_text(material_line))],
    )
    line_group = {
        "id": "groupe_demarrage",
        "type": "groupe",
        "nom": "Pack démarrage",
        "description": "Groupe fictif",
        "postes": [service_line, material_line],
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    connection.execute(
        "INSERT INTO postes_groupes (id, kind, payload) VALUES (?, 'facturation', ?)",
        (line_group["id"], json_text(line_group)),
    )
    sector = {"id": "secteur_conseil", "nom": "Conseil", "ordre": 1}
    connection.execute(
        "INSERT INTO secteurs_activite (id, payload) VALUES (?, ?)",
        (sector["id"], json_text(sector)),
    )

    quote = document_base(
        document_id="devis_2026_0001",
        number="DEVIS-2026-0001",
        client_id="cli_techsolutions",
        issue_date="2026-01-02",
        due_date="2026-02-01",
        lines=[service_line, material_line],
        total_ht=1500,
        total_vat=300,
        total_ttc=1800,
        status="accepte",
    )
    quote.update({"documentType": "devis", "dateValidite": iso("2026-02-01"), "factureGeneree": "facture_2026_0001"})
    invoice = document_base(
        document_id="facture_2026_0001",
        number="FAC-DEVIS-2026-0001-01",
        client_id="cli_techsolutions",
        issue_date="2026-01-03",
        due_date="2026-02-02",
        lines=[service_line, material_line],
        total_ht=1500,
        total_vat=300,
        total_ttc=1800,
        status="payee",
    )
    invoice.update(
        {
            "documentType": "facture",
            "devisOrigine": quote["id"],
            "paiements": [
                {
                    "id": "pay_2026_0001",
                    "factureId": "facture_2026_0001",
                    "montant": 1800,
                    "datePaiement": iso("2026-01-10"),
                    "modePaiement": "virement",
                    "transactionId": "2",
                    "reference": "Virement facture FAC-DEVIS-2026-0001-01",
                }
            ],
        }
    )
    connection.execute(
        """INSERT INTO devis (id, client_id, numero, statut, supprime, payload, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)""",
        (quote["id"], quote["clientId"], quote["numero"], quote["statut"], json_text(quote), NOW),
    )
    connection.execute(
        """INSERT INTO factures
           (id, client_id, numero, statut, devis_origine, supprime, payload, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)""",
        (
            invoice["id"],
            invoice["clientId"],
            invoice["numero"],
            invoice["statut"],
            invoice["devisOrigine"],
            json_text(invoice),
            NOW,
        ),
    )
    mention = {
        "id": "mention_penalites",
        "type": "predefined",
        "label": "Pénalités de retard",
        "content": "Pénalités exigibles dès le lendemain de la date d’échéance.",
        "category": "penalites",
        "required": True,
        "enabled": True,
    }
    connection.execute(
        "INSERT INTO legal_mentions (id, payload) VALUES (?, ?)",
        (mention["id"], json_text(mention)),
    )

    association = {
        "denominationSociale": "Association Développement Comptal",
        "objetSocial": "Tests fonctionnels du module associatif",
        "rna": "W751234567",
        "siren": "732829320",
        "siret": "73282932000074",
        "adresse": {
            "rue": "5 avenue des Scénarios",
            "codePostal": "75012",
            "ville": "Paris",
            "pays": "France",
        },
        "email": "association@example.test",
        "statutOIG": True,
        "referencesCGI": "Articles 200 et 238 bis du code général des impôts",
        "signataireNom": "Camille Test",
        "signataireQualite": "Présidente",
        "nextReceiptNumber": 2,
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    connection.execute(
        "INSERT INTO association_config (id, payload) VALUES (1, ?)",
        (json_text(association),),
    )
    donors = [
        {
            "id": "donateur_fondation",
            "type": "entreprise",
            "color": "#10b981",
            "denominationSociale": "Fondation Exemple",
            "adresse": {
                "rue": "1 place Solidaire",
                "codePostal": "75011",
                "ville": "Paris",
                "pays": "France",
            },
            "email": "fondation@example.test",
            "categoryCode": "DONS",
            "createdAt": NOW,
            "updatedAt": NOW,
        },
        {
            "id": "donateur_alice",
            "type": "particulier",
            "color": "#8b5cf6",
            "civilite": "Mme",
            "nom": "Martin",
            "prenom": "Alice",
            "adresse": {
                "rue": "8 rue Victor-Hugo",
                "codePostal": "69002",
                "ville": "Lyon",
                "pays": "France",
            },
            "email": "alice.martin@example.test",
            "createdAt": NOW,
            "updatedAt": NOW,
        },
    ]
    connection.executemany(
        "INSERT INTO donateurs (id, payload, updated_at) VALUES (?, ?, ?)",
        [(donor["id"], json_text(donor), NOW) for donor in donors],
    )
    foundation_contact = {
        **donors[0],
        "roles": ["donateur"],
        "adresseFacturation": donors[0]["adresse"],
        "codeClient": "FO001",
    }
    connection.execute(
        """INSERT INTO clients (id, code_client, type, archived, payload, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)""",
        (
            foundation_contact["id"],
            foundation_contact["codeClient"],
            foundation_contact["type"],
            json_text(foundation_contact),
            NOW,
        ),
    )
    connection.executemany(
        "INSERT INTO donateur_transactions (transaction_id, donateur_id) VALUES (?, ?)",
        [("14", "donateur_fondation"), ("20", "donateur_alice")],
    )
    manual_donation = {
        "id": "don_manuel_001",
        "donateurId": "donateur_alice",
        "donorLabel": "Alice Martin",
        "montant": 250,
        "date": iso("2026-07-10"),
        "datePerception": iso("2026-07-10"),
        "modeVersement": "cheque",
        "natureDon": "numeraire",
        "description": "Don manuel fictif",
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    connection.execute(
        "INSERT INTO dons_manuels (id, donateur_id, payload) VALUES (?, ?, ?)",
        (manual_donation["id"], manual_donation["donateurId"], json_text(manual_donation)),
    )
    normalized_donations = [
        ("dontx_fondation", "donateur_fondation", 0, None, "transaction", "14", "numeraire", "virement", 1200, "2026-04-14", "2026-04-14", "Don Fondation Exemple", None, 0, None, 1, "receipt_001"),
        ("dontx_alice", "cli_martin", 0, None, "transaction", "20", "numeraire", "virement", 800, "2026-06-18", "2026-06-18", "Don Alice Martin", None, 0, None, 1, None),
        ("don_manuel_001", "cli_martin", 0, None, "manuel", None, "numeraire", "cheque", 250, "2026-07-10", "2026-07-10", "Don manuel fictif", None, 0, None, 1, "receipt_002"),
        ("don_nature_001", "donateur_fondation", 0, None, "manuel", None, "nature", None, 480, "2026-08-12", "2026-08-12", "12 chaises pliantes pour les ateliers", "Valeur de marché communiquée par la fondation", 1, "Bon de remise conservé", 1, None),
        ("don_anonyme_especes", None, 1, "Collecte forum septembre", "manuel", None, "numeraire", "especes", 186.50, "2026-09-01", "2026-09-01", "Urne de collecte", None, 0, "Comptage par deux bénévoles", 0, None),
    ]
    connection.executemany(
        """INSERT INTO donations
          (id, contact_id, anonymous, donor_label, source, transaction_id, nature,
           payment_method, amount, donation_date, received_date, description,
           valuation_method, valuation_by_donor, notes, receipt_eligible, receipt_id,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [(*donation, NOW, NOW) for donation in normalized_donations],
    )
    connection.execute(
        """INSERT INTO donation_rules
           (id, contact_id, label_contains, category_code, payment_method, active, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?)""",
        ("rule_fondation", "donateur_fondation", "Fondation Exemple", "DONS", "virement", NOW),
    )
    receipts = [
        {
            "id": "receipt_001",
            "numero": "RECU-2026-0001",
            "donateurId": "donateur_fondation",
            "donateurLabel": "Fondation Exemple",
            "montant": 1200,
            "date": "2026-04-14",
            "dateEmission": "2026-04-15",
            "natureDon": "numeraire",
            "modeVersement": "virement",
        },
        {
            "id": "receipt_002",
            "numero": "RECU-2026-0002",
            "donateurId": "donateur_alice",
            "donateurLabel": "Alice Martin",
            "montant": 250,
            "date": "2026-07-10",
            "dateEmission": "2026-07-11",
            "natureDon": "numeraire",
            "modeVersement": "cheque",
        },
    ]
    connection.executemany(
        "INSERT INTO registre_recus (id, payload) VALUES (?, ?)",
        [(receipt["id"], json_text(receipt)) for receipt in receipts],
    )

    register_settings = {
        "prefix": "REG",
        "nextSequence": 6,
        "numberFormat": "{PREFIX}-{YEAR}-{SEQ:4}",
        "defaultTitle": "Document de référence",
        "defaultNotes": "Document établi à partir des données du profil actif.",
        "pdfFormat": "A4",
        "pdfOrientation": "portrait",
        "includeOrganization": True,
        "accentColor": "#1e3a8a",
    }
    connection.execute(
        "INSERT INTO register_settings (id, payload) VALUES (1, ?)",
        (json_text(register_settings),),
    )
    register_documents = [
        (
            "regdoc_factures_2026",
            "REG-2026-0001",
            "invoice_summary",
            "Situation de facturation — été 2026",
            "2026-01-01",
            "2026-08-31",
            "Exemple enrichi pour découvrir le registre.",
            {
                "periodStart": "2026-01-01",
                "periodEnd": "2026-08-31",
                "rows": [
                    {"label": "FAC-DEVIS-2026-0001-01", "detail": "payée", "amount": 1800, "credit": 1800},
                ],
                "totals": {"invoiced": 1800, "paid": 1800, "outstanding": 0},
            },
        ),
        (
            "regdoc_flux_2026",
            "REG-2026-0002",
            "cashflow_summary",
            "Bilan dépenses et crédits 2026",
            "2026-01-01",
            "2026-08-31",
            "Instantané de démonstration par catégories.",
            {
                "periodStart": "2026-01-01",
                "periodEnd": "2026-08-31",
                "rows": [
                    {"label": "Dons reçus", "debit": 0, "credit": 2000},
                    {"label": "Fournitures", "debit": 450.3, "credit": 0},
                    {"label": "Frais bancaires", "debit": 18.5, "credit": 0},
                    {"label": "Hors statistiques", "debit": 250, "credit": 0},
                    {"label": "Loyer et charges", "debit": 9600, "credit": 0},
                    {"label": "Repas professionnels", "debit": 149.5, "credit": 0},
                    {"label": "Revenus clients", "debit": 0, "credit": 15900},
                    {"label": "Salaires", "debit": 4500, "credit": 0},
                    {"label": "Transferts internes", "debit": 5000, "credit": 5000},
                    {"label": "Transport", "debit": 235, "credit": 0},
                ],
                "totals": {"expenses": 20203.3, "credits": 22900, "balance": 2696.7},
            },
        ),
        (
            "regdoc_dons_2026",
            "REG-2026-0003",
            "reference",
            "Journal chronologique des dons 2026",
            "2026-01-01",
            "2026-09-01",
            "Données de démonstration : dons identifiés, anonyme, numéraire et nature.",
            {
                "registerType": "donation_journal",
                "periodStart": "2026-01-01",
                "periodEnd": "2026-09-01",
                "rows": [
                    {"label": "2026-04-14 · Fondation Exemple", "detail": "Numéraire — virement", "amount": 1200},
                    {"label": "2026-06-18 · Alice Martin", "detail": "Numéraire — virement", "amount": 800},
                    {"label": "2026-07-10 · Alice Martin", "detail": "Numéraire — chèque", "amount": 250},
                    {"label": "2026-08-12 · Fondation Exemple", "detail": "Don en nature — 12 chaises pliantes", "amount": 480},
                    {"label": "2026-09-01 · Don anonyme", "detail": "Numéraire — espèces", "amount": 186.5},
                ],
                "totals": {"donations": 2916.5, "donationCount": 5, "anonymous": 186.5},
            },
        ),
        (
            "regdoc_recus_2026",
            "REG-2026-0004",
            "reference",
            "Registre des reçus fiscaux 2026",
            "2026-01-01",
            "2026-12-31",
            "Les doubles des reçus doivent être conservés avec les justificatifs fiscaux.",
            {
                "registerType": "tax_receipt_register",
                "periodStart": "2026-01-01",
                "periodEnd": "2026-12-31",
                "rows": [
                    {"label": "RECU-2026-0001", "detail": "Fondation Exemple", "amount": 1200},
                    {"label": "RECU-2026-0002", "detail": "Alice Martin", "amount": 250},
                ],
                "totals": {"receipts": 1450, "receiptCount": 2},
            },
        ),
        (
            "regdoc_etat_annuel_2026",
            "REG-2026-0005",
            "reference",
            "État annuel des reçus fiscaux 2026",
            "2026-01-01",
            "2026-12-31",
            "Synthèse du nombre de reçus délivrés et de leur montant cumulé.",
            {
                "registerType": "annual_donation_statement",
                "periodStart": "2026-01-01",
                "periodEnd": "2026-12-31",
                "rows": [
                    {"label": "Exercice 2026", "detail": "2 reçus actifs", "amount": 1450},
                ],
                "totals": {"receipts": 1450, "receiptCount": 2},
            },
        ),
    ]
    connection.executemany(
        """INSERT INTO register_documents
           (id, number, type, title, status, period_start, period_end, notes, snapshot, pdf_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'generated', ?, ?, ?, ?, NULL, ?, ?)""",
        [
            (
                document_id,
                number,
                document_type,
                title,
                period_start,
                period_end,
                notes,
                json_text(snapshot),
                NOW,
                NOW,
            )
            for document_id, number, document_type, title, period_start, period_end, notes, snapshot
            in register_documents
        ],
    )
    connection.execute(
        """INSERT INTO register_items
           (id, document_id, label, description, amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        ("regitem_demo", "regdoc_factures_2026", "Contrôle effectué", "Facture intégralement rapprochée.", 1800, NOW),
    )
    connection.execute(
        """INSERT INTO register_links
           (id, document_id, label, value, url, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        ("reglink_demo", "regdoc_factures_2026", "Dossier de clôture", "Été 2026", "REF-CLOTURE-2026", NOW),
    )
    connection.executemany(
        """INSERT INTO register_attachments
           (id, document_id, name, path, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)""",
        [
            ("regattachment_global", None, "notice-registre.txt", f"profils/{profile_id}/attachments/notice-registre.txt", "text/plain", NOW),
            ("regattachment_doc", "regdoc_factures_2026", "justificatif-exemple.txt", f"profils/{profile_id}/attachments/justificatif-exemple.txt", "text/plain", NOW),
        ],
    )

    enrich_for_kind(connection, kind, account_ids)
    connection.commit()
    return {
        table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in (
            "accounts",
            "categories",
            "transactions",
            "projects",
            "project_subscriptions",
            "clients",
            "devis",
            "factures",
            "donateurs",
            "dons_manuels",
            "donations",
            "donation_rules",
            "registre_recus",
            "register_documents",
            "register_items",
            "register_links",
            "register_attachments",
        )
    }


def activate_profile(profile_id: str) -> None:
    settings_path = DATA_ROOT / "parameter" / "settings.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings: dict[str, object] = {}
    if settings_path.exists():
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
    settings["activeProfileId"] = profile_id
    settings_path.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Créer une base de développement Comptal2.1 reproductible."
    )
    parser.add_argument("--profile-id", default=DEFAULT_PROFILE_ID)
    parser.add_argument("--profile-name", default="Développement Comptal2.1")
    parser.add_argument(
        "--kind",
        choices=("mixte", "entreprise", "association", "micro"),
        default="mixte",
        help="Scénario : mixte (défaut, tests), entreprise, association ou micro.",
    )
    parser.add_argument(
        "--suite",
        action="store_true",
        help="Créer les profils Tests Entreprise, Association et Micro-entreprise.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Remplacer le profil de développement s’il existe déjà.",
    )
    parser.add_argument(
        "--activate",
        action="store_true",
        help="Définir ce profil comme profil actif dans settings.json.",
    )
    return parser.parse_args()


def write_profile(profile_id: str, profile_name: str, kind: str, force: bool) -> dict[str, object]:
    if not profile_id or any(part in profile_id for part in ("/", "\\", "..")):
        raise SystemExit("profile-id invalide : utilisez un nom de dossier simple.")

    profile_dir = DATA_ROOT / "profils" / profile_id
    if profile_dir.exists():
        if not force:
            raise SystemExit(
                f"Le profil {profile_id!r} existe déjà. Utilisez --force pour le remplacer."
            )
        info_path = profile_dir / "info.json"
        try:
            existing_info = json.loads(info_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing_info = {}
        if existing_info.get("developmentDatabase") is not True:
            raise SystemExit(
                "Refus de remplacer un profil qui n’a pas été créé par ce générateur."
            )
        shutil.rmtree(profile_dir)

    profile_dir.mkdir(parents=True)
    info = {
        "id": profile_id,
        "name": profile_name,
        "createdAt": NOW,
        "developmentDatabase": True,
        "kind": kind,
        "usageMode": "association" if kind == "association" else "tpe",
    }
    (profile_dir / "info.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    database_path = profile_dir / "comptal.db"
    attachments_dir = profile_dir / "attachments"
    attachments_dir.mkdir()
    (attachments_dir / "notice-registre.txt").write_text(
        "Pièce jointe globale fictive du registre de développement.\n",
        encoding="utf-8",
    )
    (attachments_dir / "justificatif-exemple.txt").write_text(
        "Justificatif fictif lié au bilan de facturation REG-2026-0001.\n",
        encoding="utf-8",
    )
    connection = sqlite3.connect(database_path)
    try:
        counts = seed_database(connection, profile_id, kind=kind)
        foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        version = connection.execute("PRAGMA user_version").fetchone()[0]
    finally:
        connection.close()

    if foreign_key_errors or integrity != "ok" or version != 18:
        database_path.unlink(missing_ok=True)
        raise SystemExit(
            f"Validation échouée: integrity={integrity}, version={version}, "
            f"foreignKeys={foreign_key_errors}"
        )

    return {
        "profileId": profile_id,
        "profileName": profile_name,
        "kind": kind,
        "database": str(database_path),
        "schemaVersion": version,
        "integrity": integrity,
        "rowCounts": counts,
    }


SUITE_PROFILES = (
    ("profile_test_entreprise", "Tests Entreprise", "entreprise"),
    ("profile_test_association", "Tests Association", "association"),
    ("profile_test_micro", "Tests Micro-entreprise", "micro"),
)


def main() -> None:
    args = parse_args()
    if args.suite:
        results = [
            write_profile(profile_id, profile_name, kind, force=True)
            for profile_id, profile_name, kind in SUITE_PROFILES
        ]
        activated = SUITE_PROFILES[0][0] if args.activate else None
        if activated:
            activate_profile(activated)
        print(
            json.dumps(
                {"activated": activated, "profiles": results},
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    result = write_profile(args.profile_id, args.profile_name, args.kind, args.force)
    if args.activate:
        activate_profile(args.profile_id)
    result["activated"] = args.activate
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
