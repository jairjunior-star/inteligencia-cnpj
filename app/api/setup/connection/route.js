import { route, readJson, json, sessionCookie, sessionToken, getSession, HttpError } from '@/lib/http';
import { parseWebhookUrl, createClient } from '@/lib/bitrix';
import { getPortalByDomain, upsertPortal } from '@/lib/portal';
import { hashPassword } from '@/lib/crypto';
import { logInfo } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Passo 1 do assistente (modo webhook): testa o webhook e grava criptografado.
 * Um portal novo pode ser configurado por quem tem o webhook; um portal já existente só por um administrador logado nele.
 */
export const POST = route(
  async ({ request }) => {
    const { webhookUrl, password } = await readJson(request);
    const parsed = parseWebhookUrl(webhookUrl);
    const session = getSession(request);
    const existing = getPortalByDomain(parsed.domain);
    if (existing && !(session && session.pid === existing.id && session.admin)) {
      throw new HttpError(403, 'portal_existente', 'Este portal já está configurado. Entre com a senha de acesso para alterar a conexão.');
    }
    if (!existing && (!password || String(password).length < 8)) {
      throw new HttpError(400, 'senha_fraca', 'Crie uma senha de acesso com pelo menos 8 caracteres.');
    }
    if (password && String(password).length < 8) {
      throw new HttpError(400, 'senha_fraca', 'A senha de acesso precisa ter pelo menos 8 caracteres.');
    }

    // Testa a conexão e os escopos necessários.
    const client = createClient({ type: 'webhook', url: parsed.url });
    const profile = await client.result('profile');
    await client.result('crm.company.fields');
    let admin = Boolean(profile?.ADMIN);
    try {
      admin = Boolean(await client.result('user.admin'));
    } catch {
      /* escopo user ausente: usa o campo ADMIN do perfil */
    }

    const portal = upsertPortal({
      domain: parsed.domain,
      mode: 'webhook',
      credentials: { webhookUrl: parsed.url },
      passwordHash: password ? hashPassword(password) : undefined,
    });
    const userName = [profile?.NAME, profile?.LAST_NAME].filter(Boolean).join(' ') || `usuário ${parsed.userId}`;
    logInfo(portal.id, 'configuracao', `Conexão por webhook salva (usuário do webhook: ${userName})`, { admin }, 'administrador');

    const payload = { pid: portal.id, mode: 'webhook', admin: true, uname: 'Administrador', exp: Date.now() + 8 * 3600000 };
    return json(
      {
        ok: true,
        sessionToken: sessionToken(payload),
        portal: { domain: portal.domain },
        webhookUser: { name: userName, admin },
        warning: admin ? null : 'O webhook foi criado por um usuário que não é administrador. O app vai respeitar as permissões de CRM desse usuário.',
      },
      200,
      { 'set-cookie': sessionCookie(request, payload, { iframe: true }) },
    );
  },
  { auth: false },
);
