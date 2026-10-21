// Portais Bitrix24 configurados (um app atende vários clientes; cada portal tem sua configuração).
import { getDb, now } from './db.js';
import { encryptJson, decryptJson, decrypt } from './crypto.js';
import { mergeSettings } from './intel.js';
import { BitrixError } from './bitrix.js';

function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    mode: row.mode,
    credentials: row.credentials,
    passwordHash: row.password_hash,
    fieldMap: JSON.parse(row.field_map || '{}'),
    settings: mergeSettings(JSON.parse(row.settings || '{}')),
    placementBound: Boolean(row.placement_bound),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getPortalById(id) {
  return hydrate(getDb().prepare('SELECT * FROM portals WHERE id = ?').get(Number(id)));
}

export function getPortalByDomain(domain) {
  return hydrate(getDb().prepare('SELECT * FROM portals WHERE domain = ?').get(String(domain).toLowerCase()));
}

export function countPortals() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM portals').get().n;
}

/** Cria ou atualiza o portal pelo domínio. */
export function upsertPortal({ domain, mode, credentials, passwordHash }) {
  const db = getDb();
  const d = String(domain).toLowerCase();
  const existing = db.prepare('SELECT * FROM portals WHERE domain = ?').get(d);
  const t = now();
  if (existing) {
    db.prepare(
      'UPDATE portals SET mode = ?, credentials = COALESCE(?, credentials), password_hash = COALESCE(?, password_hash), updated_at = ? WHERE id = ?',
    ).run(mode, credentials ? encryptJson(credentials) : null, passwordHash ?? null, t, existing.id);
    return getPortalById(existing.id);
  }
  const info = db
    .prepare('INSERT INTO portals (domain, mode, credentials, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(d, mode, credentials ? encryptJson(credentials) : null, passwordHash ?? null, t, t);
  return getPortalById(info.lastInsertRowid);
}

export function saveFieldMap(portalId, map) {
  getDb().prepare('UPDATE portals SET field_map = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(map || {}), now(), portalId);
}

export function saveSettings(portalId, settings) {
  const clean = mergeSettings(settings);
  getDb().prepare('UPDATE portals SET settings = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(clean), now(), portalId);
  return clean;
}

export function setPlacementBound(portalId, bound) {
  getDb().prepare('UPDATE portals SET placement_bound = ?, updated_at = ? WHERE id = ?').run(bound ? 1 : 0, now(), portalId);
}

/**
 * Conexão para chamar a API REST.
 * Quem abriu o app pelo Bitrix24 usa o próprio token (respeita as permissões do usuário no CRM).
 * No modo webhook, usa o webhook do portal guardado criptografado.
 */
export function connectionFor(portal, session) {
  if (session?.mode === 'app' && session.auth) {
    const auth = JSON.parse(decrypt(session.auth));
    if (auth.expires && auth.expires < Date.now()) {
      throw new BitrixError('expired_token', 'Sua sessão do Bitrix24 expirou. Abra o aplicativo novamente pelo Bitrix24.', 401);
    }
    return { type: 'app', domain: auth.domain, accessToken: auth.accessToken };
  }
  const creds = decryptJson(portal.credentials);
  if (!creds?.webhookUrl) throw new BitrixError('sem_conexao', 'Conexão com o Bitrix24 não configurada.', 409);
  return { type: 'webhook', url: creds.webhookUrl };
}

/** Configuração mínima concluída? (conexão + campo CNPJ mapeado) */
export function isConfigured(portal) {
  return Boolean(portal && portal.fieldMap && portal.fieldMap.cnpj);
}
