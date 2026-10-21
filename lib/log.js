// Registro das operações relevantes (consultas, cadastros, atualizações, erros).
// Nunca grava tokens: os detalhes passam por um filtro que remove chaves sensíveis.
import { getDb, now } from './db.js';

const SENSITIVE = /token|auth|secret|password|senha|webhook|refresh/i;

function scrub(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[protegido]' : scrub(v, depth + 1);
    return out;
  }
  if (typeof value === 'string' && /\/rest\/\d+\/[A-Za-z0-9]+/.test(value)) return value.replace(/\/rest\/\d+\/[A-Za-z0-9]+/g, '/rest/[protegido]');
  return value;
}

export function log(portalId, level, action, message, details = null, user = null) {
  const safe = details ? scrub(details) : null;
  try {
    getDb()
      .prepare('INSERT INTO logs (portal_id, at, level, action, message, details, user) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(portalId ?? null, now(), level, action, message, safe ? JSON.stringify(safe) : null, user ?? null);
  } catch (err) {
    console.error('[log] falha ao gravar log', err);
  }
  const line = `[${level}] ${action}: ${message}`;
  if (level === 'erro') console.error(line);
  else console.log(line);
}

export const logInfo = (p, a, m, d, u) => log(p, 'info', a, m, d, u);
export const logWarn = (p, a, m, d, u) => log(p, 'aviso', a, m, d, u);
export const logError = (p, a, m, d, u) => log(p, 'erro', a, m, d, u);

export function listLogs(portalId, { limit = 200, level = null } = {}) {
  const db = getDb();
  const rows = level
    ? db.prepare('SELECT * FROM logs WHERE portal_id = ? AND level = ? ORDER BY at DESC LIMIT ?').all(portalId, level, limit)
    : db.prepare('SELECT * FROM logs WHERE portal_id = ? ORDER BY at DESC LIMIT ?').all(portalId, limit);
  return rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
}
