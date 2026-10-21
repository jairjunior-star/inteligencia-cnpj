import { route, readJson, json, sessionCookie, HttpError } from '@/lib/http';
import { getPortalByDomain } from '@/lib/portal';
import { verifyPassword } from '@/lib/crypto';
import { logWarn, logInfo } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tentativas por endereço do portal, para dificultar força bruta (memória do processo).
const attempts = new Map();

function normalizeDomain(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

export const POST = route(
  async ({ request }) => {
    const { domain: rawDomain, password } = await readJson(request);
    const domain = normalizeDomain(rawDomain);
    if (!domain || !password) throw new HttpError(400, 'dados_incompletos', 'Informe o endereço do portal e a senha de acesso.');

    const a = attempts.get(domain) || { count: 0, until: 0 };
    if (a.until > Date.now()) {
      const min = Math.ceil((a.until - Date.now()) / 60000);
      throw new HttpError(429, 'muitas_tentativas', `Muitas tentativas. Tente novamente em ${min} minuto(s).`);
    }
    const portal = getPortalByDomain(domain);
    if (!portal || !portal.passwordHash || !verifyPassword(password, portal.passwordHash)) {
      a.count += 1;
      if (a.count >= 5) {
        a.until = Date.now() + 10 * 60000;
        a.count = 0;
      }
      attempts.set(domain, a);
      if (portal) logWarn(portal.id, 'login', 'Tentativa de acesso com senha incorreta');
      throw new HttpError(401, 'login_invalido', 'Portal ou senha incorretos.');
    }
    attempts.delete(domain);
    logInfo(portal.id, 'login', 'Acesso pelo modo webhook', null, 'administrador');
    return json(
      { ok: true },
      200,
      { 'set-cookie': sessionCookie(request, { pid: portal.id, mode: 'webhook', admin: true, uname: 'Administrador' }) },
    );
  },
  { auth: false },
);
