// Cliente da API REST oficial do Bitrix24.
// Dois modos de conexão, sem IDs fixos de portal:
//  - webhook: URL do webhook de entrada informada pelo cliente no assistente de configuração;
//  - app: token do usuário que abriu o aplicativo dentro do Bitrix24 (respeita as permissões dele).

export class BitrixError extends Error {
  constructor(code, message, status = 502, raw = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.raw = raw;
  }
}

const FRIENDLY = {
  expired_token: ['Sua sessão do Bitrix24 expirou. Abra o aplicativo novamente pelo Bitrix24.', 401],
  invalid_token: ['Token do Bitrix24 inválido. Abra o aplicativo novamente pelo Bitrix24.', 401],
  NO_AUTH_FOUND: ['Webhook inválido ou removido. Gere um novo webhook de entrada e atualize a configuração.', 401],
  INVALID_CREDENTIALS: ['Webhook inválido ou sem acesso. Confira a URL e os escopos do webhook.', 401],
  insufficient_scope: ['O webhook ou o aplicativo não tem permissão para o CRM. Inclua o escopo "CRM (crm)".', 403],
  ACCESS_DENIED: ['Seu usuário não tem permissão para esta ação no Bitrix24.', 403],
  QUERY_LIMIT_EXCEEDED: ['O Bitrix24 limitou o número de requisições. Aguarde alguns segundos e tente de novo.', 429],
  ERROR_METHOD_NOT_FOUND: ['Método não disponível neste portal. Confira os escopos do webhook ou do aplicativo.', 400],
  NOT_FOUND: ['Registro não encontrado no Bitrix24.', 404],
};

export function friendlyError(code, description) {
  const f = FRIENDLY[code];
  if (f) return { message: f[0], status: f[1] };
  return { message: description ? `Bitrix24: ${description}` : 'Erro ao comunicar com o Bitrix24.', status: 502 };
}

const WEBHOOK_RE = /^https:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?\/rest\/(\d+)\/([A-Za-z0-9]+)\/?$/i;

/** Valida e normaliza a URL do webhook de entrada. Retorna { url, domain, userId } ou lança erro. */
export function parseWebhookUrl(input) {
  let s = String(input ?? '').trim();
  // Aceita a URL de exemplo que o Bitrix24 mostra (com o método no final, ex.: .../profile.json).
  s = s.replace(/\/[a-z0-9_.]+\.json$/i, '/').replace(/\/[a-z]+\.[a-z0-9_.]+$/i, '/');
  const m = s.match(WEBHOOK_RE);
  if (!m) {
    throw new BitrixError(
      'webhook_invalido',
      'URL de webhook inválida. Ela deve ter o formato https://seuportal.bitrix24.com.br/rest/1/codigo/',
      400,
    );
  }
  const url = s.endsWith('/') ? s : `${s}/`;
  return { url, domain: m[1].toLowerCase(), userId: Number(m[2]) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient(conn, { fetchImpl = fetch, minIntervalMs = 350 } = {}) {
  if (!conn) throw new BitrixError('sem_conexao', 'Bitrix24 não configurado.', 409);
  let last = 0;

  function endpoint(method) {
    if (conn.type === 'webhook') return `${conn.url}${method}.json`;
    if (conn.type === 'app') return `https://${conn.domain}/rest/${method}.json`;
    throw new BitrixError('sem_conexao', 'Tipo de conexão desconhecido.', 500);
  }

  async function call(method, params = {}, attempt = 0) {
    // Ritmo de no máximo ~3 req/s para respeitar o limite do Bitrix24.
    const wait = last + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();

    const body = conn.type === 'app' ? { ...params, auth: conn.accessToken } : params;
    let res;
    try {
      res = await fetchImpl(endpoint(method), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      if (attempt < 2) {
        await sleep(800 * (attempt + 1));
        return call(method, params, attempt + 1);
      }
      throw new BitrixError('rede', `Não foi possível conectar ao Bitrix24 (${err.name === 'TimeoutError' ? 'tempo esgotado' : err.message}).`, 502);
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (json && json.error) {
      if ((json.error === 'QUERY_LIMIT_EXCEEDED' || res.status === 503) && attempt < 3) {
        await sleep(1000 * (attempt + 1));
        return call(method, params, attempt + 1);
      }
      const f = friendlyError(json.error, json.error_description);
      throw new BitrixError(json.error, f.message, f.status, { method, error: json.error, description: json.error_description });
    }
    if (!res.ok || !json) {
      if (res.status >= 500 && attempt < 2) {
        await sleep(1000 * (attempt + 1));
        return call(method, params, attempt + 1);
      }
      if (res.status === 401) {
        const f = friendlyError(conn.type === 'app' ? 'expired_token' : 'NO_AUTH_FOUND');
        throw new BitrixError('nao_autorizado', f.message, 401);
      }
      throw new BitrixError('http', `O Bitrix24 respondeu com erro HTTP ${res.status}.`, 502);
    }
    return json;
  }

  /** Retorna só o campo result. */
  async function result(method, params) {
    return (await call(method, params)).result;
  }

  /** Lista paginada (50 por página no Bitrix24) até o limite informado. */
  async function list(method, params = {}, max = 2000) {
    const out = [];
    let start = 0;
    while (out.length < max) {
      const json = await call(method, { ...params, start });
      const items = Array.isArray(json.result) ? json.result : json.result?.items ?? [];
      out.push(...items);
      if (json.next == null || items.length === 0) break;
      start = json.next;
    }
    return out.slice(0, max);
  }

  return { call, result, list, conn };
}
