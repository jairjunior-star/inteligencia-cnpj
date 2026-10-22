// Banco local SQLite em ./data/app.db usando o módulo nativo node:sqlite (Node 22.13+).
// Sem dependências nativas para compilar: funciona em qualquer hospedagem Node.
import fs from 'node:fs';
import path from 'node:path';

export function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS portals (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     domain TEXT NOT NULL UNIQUE,
     mode TEXT NOT NULL,                 -- 'webhook' | 'app'
     credentials TEXT,                   -- JSON criptografado (AES-256-GCM)
     password_hash TEXT,                 -- senha de acesso (modo webhook)
     field_map TEXT NOT NULL DEFAULT '{}',
     settings TEXT NOT NULL DEFAULT '{}',
     placement_bound INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS cnpj_cache (
     cnpj TEXT PRIMARY KEY,
     source TEXT NOT NULL,
     data TEXT NOT NULL,
     fetched_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS enrichments (
     portal_id INTEGER NOT NULL,
     cnpj TEXT NOT NULL,
     company_id INTEGER,
     title TEXT,
     segment TEXT,
     porte TEXT,
     uf TEXT,
     city TEXT,
     situacao TEXT,
     score INTEGER,
     grade TEXT,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (portal_id, cnpj)
   )`,
  `CREATE TABLE IF NOT EXISTS companies (
     portal_id INTEGER NOT NULL,
     id INTEGER NOT NULL,
     title TEXT,
     cnpj TEXT,
     enriched_at TEXT,
     date_modify TEXT,
     synced_at INTEGER NOT NULL,
     PRIMARY KEY (portal_id, id)
   )`,
  `CREATE TABLE IF NOT EXISTS sync_state (
     portal_id INTEGER PRIMARY KEY,
     companies_synced_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS logs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     portal_id INTEGER,
     at INTEGER NOT NULL,
     level TEXT NOT NULL,
     action TEXT NOT NULL,
     message TEXT NOT NULL,
     details TEXT,
     user TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_logs_portal_at ON logs (portal_id, at DESC)`,
  `CREATE TABLE IF NOT EXISTS lists (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     portal_id INTEGER NOT NULL,
     name TEXT NOT NULL,
     created_by TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS list_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     list_id INTEGER NOT NULL,
     cnpj TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pendente', -- pendente | pronto | nao_encontrado | erro
     error TEXT,
     company_id INTEGER,
     deal_id INTEGER,
     imported_at INTEGER,
     UNIQUE (list_id, cnpj)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items (list_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_companies_cnpj ON companies (portal_id, cnpj)`,
];

function addColumns(db, table, cols) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, type] of Object.entries(cols)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

function open() {
  const getBuiltin = process.getBuiltinModule;
  if (typeof getBuiltin !== 'function') {
    throw new Error('Este aplicativo precisa do Node.js 22.13 ou superior (módulo node:sqlite).');
  }
  const { DatabaseSync } = getBuiltin('node:sqlite');
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'app.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  for (const sql of MIGRATIONS) db.exec(sql);
  // Colunas novas da base de prospecção (bancos criados por versões anteriores ganham as colunas aqui).
  addColumns(db, 'enrichments', {
    razao: 'TEXT',
    cnae: 'TEXT',
    cnae_desc: 'TEXT',
    subsegment: 'TEXT',
    capital: 'REAL',
    abertura: 'TEXT',
    phone: 'TEXT',
    email: 'TEXT',
  });
  return db;
}

/** Conexão única por processo (sobrevive ao hot reload do Next em desenvolvimento). */
export function getDb() {
  const g = globalThis;
  if (!g.__cnpjiDb) g.__cnpjiDb = open();
  return g.__cnpjiDb;
}

/** Usado nos testes para trocar de pasta de dados. */
export function resetDbForTests() {
  const g = globalThis;
  if (g.__cnpjiDb) {
    try { g.__cnpjiDb.close(); } catch { /* ignore */ }
  }
  g.__cnpjiDb = undefined;
}

export function now() {
  return Date.now();
}
