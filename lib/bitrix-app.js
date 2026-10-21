// Entrada do app quando aberto dentro do Bitrix24 (aplicativo local ou do Marketplace).
// O Bitrix24 envia por POST o token do usuário que abriu o app; validamos chamando a API do próprio portal.
import { createClient, BitrixError } from './bitrix.js';
import { upsertPortal, getPortalByDomain, isConfigured } from './portal.js';
import { encrypt } from './crypto.js';
import { sessionCookie, sessionToken } from './http.js';
import { logInfo } from './log.js';

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?$/i;

/** Lê os parâmetros enviados pelo Bitrix24 (form POST + query string). */
export async function readBitrixParams(request) {
  const url = new URL(request.url);
  let form = new URLSearchParams();
  const ct = request.headers.get('content-type') || '';
  if (request.method === 'POST') {
    if (ct.includes('application/json')) {
      const j = await request.json().catch(() => ({}));
      form = new URLSearchParams(Object.entries(j).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
    } else {
      const fd = await request.formData().catch(() => null);
      if (fd) for (const [k, v] of fd.entries()) form.set(k, String(v));
    }
  }
  const get = (k) => form.get(k) ?? url.searchParams.get(k);
  return {
    domain: (get('DOMAIN') || get('auth[domain]') || '').toLowerCase(),
    authId: get('AUTH_ID') || get('auth[access_token]'),
    authExpires: Number(get('AUTH_EXPIRES') || get('auth[expires_in]') || 3600),
    placement: get('PLACEMENT'),
    placementOptions: get('PLACEMENT_OPTIONS'),
  };
}

function htmlPage(title, bodyHtml, script = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:40px 20px;color:#0f3060;background:#f4f7fb}main{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 8px 24px rgba(1,37,97,.1)}h1{font-size:20px;margin:0 0 8px}p{line-height:1.5;color:#33415a}</style>
</head><body><main>${bodyHtml}</main>${script}</body></html>`;
}

export function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

export function errorPage(message) {
  return htmlResponse(htmlPage('Inteligência de CNPJ', `<h1>Não foi possível abrir o aplicativo</h1><p>${message.replace(/</g, '&lt;')}</p>`), 400);
}

/** Valida o token, registra o portal e cria a sessão do usuário. */
export async function enterFromBitrix(request, { fetchImpl } = {}) {
  const p = await readBitrixParams(request);
  if (!p.domain || !DOMAIN_RE.test(p.domain) || !p.authId) {
    throw new BitrixError('parametros', 'Abra este aplicativo pelo menu Aplicativos do Bitrix24.', 400);
  }
  const conn = { type: 'app', domain: p.domain, accessToken: p.authId };
  const client = createClient(conn, { fetchImpl, minIntervalMs: 0 });
  const profile = await client.result('profile'); // garante que o token é válido neste portal
  let admin = Boolean(profile?.ADMIN);
  try {
    admin = Boolean(await client.result('user.admin'));
  } catch {
    /* mantém o valor do perfil */
  }
  const existing = getPortalByDomain(p.domain);
  const portal = existing || upsertPortal({ domain: p.domain, mode: 'app' });
  const uname = [profile?.NAME, profile?.LAST_NAME].filter(Boolean).join(' ') || `Usuário ${profile?.ID ?? ''}`.trim();
  const expires = Date.now() + Math.max(300, p.authExpires - 60) * 1000;
  const payload = {
    pid: portal.id,
    mode: 'app',
    uid: Number(profile?.ID) || null,
    uname,
    admin,
    auth: encrypt(JSON.stringify({ domain: p.domain, accessToken: p.authId, expires })),
    exp: expires,
  };
  logInfo(portal.id, 'acesso', `${uname} abriu o app pelo Bitrix24${p.placement && p.placement !== 'DEFAULT' ? ` (${p.placement})` : ''}`, null, uname);

  let target = '/';
  if (!isConfigured(portal)) target = admin ? '/configuracao' : '/?pendente=1';
  if (p.placement === 'CRM_COMPANY_DETAIL_TAB' && p.placementOptions) {
    try {
      const id = Number(JSON.parse(p.placementOptions).ID);
      if (id > 0 && isConfigured(portal)) target = `/empresa/${id}?aba=1`;
    } catch {
      /* ignora */
    }
  }
  const token = sessionToken(payload);
  const safe = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const script = `<script>try{sessionStorage.setItem('cnpji_session',${safe(token)})}catch(e){}location.replace(${safe(target)});</script>`;
  return htmlResponse(htmlPage('Inteligência de CNPJ', '<h1>Abrindo Inteligência de CNPJ…</h1>', script), 200, {
    'set-cookie': sessionCookie(request, payload, { iframe: true }),
  });
}

/** Página de instalação: conclui a instalação no Bitrix24. */
export function installPage() {
  const body = '<h1>Inteligência de CNPJ instalado</h1><p>Concluindo a instalação. Em seguida, abra o aplicativo pelo menu Aplicativos para fazer a configuração inicial.</p>';
  const script = `<script src="https://api.bitrix24.com/api/v1/"></script><script>if(window.BX24){BX24.init(function(){BX24.installFinish();});}</script>`;
  return htmlResponse(htmlPage('Instalação concluída', body, script));
}
