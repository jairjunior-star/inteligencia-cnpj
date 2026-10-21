import { route, publicOrigin, HttpError, sessionUser } from '@/lib/http';
import { setPlacementBound } from '@/lib/portal';
import { clientFor } from '@/lib/service';
import { logInfo } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Adiciona a aba "Inteligência de CNPJ" no cadastro da empresa (somente quando o app está instalado no Bitrix24).
export const POST = route(
  async ({ request, portal, session }) => {
    if (session.mode !== 'app') {
      throw new HttpError(400, 'somente_app', 'A aba na empresa só pode ser criada com o app aberto dentro do Bitrix24.');
    }
    const client = clientFor(portal, session);
    const handler = `${publicOrigin(request)}/api/bitrix/app`;
    try {
      await client.result('placement.unbind', { PLACEMENT: 'CRM_COMPANY_DETAIL_TAB', HANDLER: handler });
    } catch {
      /* ainda não existia */
    }
    await client.result('placement.bind', {
      PLACEMENT: 'CRM_COMPANY_DETAIL_TAB',
      HANDLER: handler,
      TITLE: 'Inteligência de CNPJ',
      DESCRIPTION: 'Dados da Receita, segmento, porte e potencial comercial',
    });
    setPlacementBound(portal.id, true);
    logInfo(portal.id, 'configuracao', 'Aba "Inteligência de CNPJ" adicionada ao cadastro de empresas', null, sessionUser(session));
    return { bound: true };
  },
  { admin: true },
);
