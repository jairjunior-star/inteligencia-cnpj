// Utilitários de rota: sessão por cookie assinado, respostas JSON padronizadas e tratamento de erros.
// Usa apenas APIs Web padrão (Request/Response), sem depender de internals do Next.
import { sign, verify } from './crypto.js';
import { getPortalById } from './portal.js';
import { BitrixError } from './bitrix.js';
import { CnpjLookupError } from './sources.js';
import { logError } from './log.js';

export const SESSION_COOKIE = 'cnpji_sess';
const SESSION_HOURS = 8;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const SESSION_HEADER = 'x-cnpji-session';

/**
 * Sessão pelo cookie ou pelo cabeçalho x-cnpji-session. O cabeçalho é usado dentro do Bitrix24
 * (iframe), onde navegadores como o Safari bloqueiam cookies de terceiros.
 */
export function getSession(request) {
  const token = request.headers.get(SESSION_HEADER) || parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  const s = verify(token);
  if (!s || !s.exp || s.exp < Date.now()) return null;
  return s;
}

function isHttps(request) {
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  return proto === 'https';
}

/** Cookie da sessão. Dentro do Bitrix24 (iframe) precisa de SameSite=None; Secure. */
export function sessionCookie(request, payload, { iframe = false } = {}) {
  const exp = payload.exp || Date.now() + SESSION_HOURS * 3600000;
  const value = sign({ ...payload, exp });
  const secure = iframe || isHttps(request);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.max(60, Math.floor((exp - Date.now()) / 1000))}`,
    iframe ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  if (iframe) parts.push('Partitioned');
  return parts.join('; ');
}

/** Token assinado da sessão (mesmo conteúdo do cookie), entregue ao front dentro do iframe. */
export function sessionToken(payload) {
  const exp = payload.exp || Date.now() + SESSION_HOURS * 3600000;
  return sign({ ...payload, exp });
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function sessionUser(session) {
  return session ? session.uname || `usuário ${session.uid ?? ''}`.trim() : null;
}

/**
 * Envolve um handler de rota.
 *  auth: exige sessão válida; admin: exige administrador (configuração).
 */
export function route(fn, { auth = true, admin = false } = {}) {
  return async (request, ctx) => {
    let session = null;
    let portal = null;
    try {
      if (auth) {
        session = getSession(request);
        if (!session) throw new HttpError(401, 'nao_autenticado', 'Faça login para continuar.');
        portal = getPortalById(session.pid);
        if (!portal) throw new HttpError(401, 'nao_autenticado', 'Portal não encontrado. Faça login novamente.');
        if (admin && !session.admin) {
          throw new HttpError(403, 'sem_permissao', 'Somente administradores do Bitrix24 podem alterar a configuração.');
        }
      }
      const params = ctx?.params ? await ctx.params : {};
      const out = await fn({ request, params, session, portal });
      if (out instanceof Response) return out;
      return json({ ok: true, ...(out || {}) });
    } catch (err) {
      const known = err instanceof HttpError || err instanceof BitrixError || err instanceof CnpjLookupError;
      const status = known ? err.status || 400 : 500;
      const message = known ? err.message : 'Erro inesperado. A falha foi registrada nos logs.';
      if (!known || status >= 500) {
        logError(portal?.id, 'erro', err.message || String(err), { code: err.code, raw: err.raw, details: err.details, path: new URL(request.url).pathname }, sessionUser(session));
      }
      return json({ ok: false, error: { code: err.code || 'erro', message } }, status);
    }
  };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'json_invalido', 'Requisição inválida.');
  }
}

/** URL pública do app (para registrar a aba no Bitrix24). */
export function publicOrigin(request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  return `${proto}://${host}`;
}
