import { route, readJson, HttpError, sessionUser } from '@/lib/http';
import { saveFieldMap, getPortalById } from '@/lib/portal';
import { inspectFields, ensureFields } from '@/lib/crm';
import { clientFor } from '@/lib/service';
import { logInfo } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Passo 2: mostra quais campos do app existem no CRM e quais podem ser usados para o CNPJ.
export const GET = route(
  async ({ portal, session }) => {
    const r = await inspectFields(clientFor(portal, session), portal.fieldMap);
    return { fields: r.status, cnpjCandidates: r.cnpjCandidates, map: { ...portal.fieldMap } };
  },
  { admin: true },
);

// Cria os campos que faltam. Opcional: usar um campo de CNPJ que o portal já tenha.
export const POST = route(
  async ({ request, portal, session }) => {
    const { cnpjField } = await readJson(request);
    const client = clientFor(portal, session);
    const base = { ...portal.fieldMap };
    if (cnpjField) {
      const { cnpjCandidates } = await inspectFields(client, base);
      if (!cnpjCandidates.some((c) => c.fieldName === cnpjField)) {
        throw new HttpError(400, 'campo_invalido', 'O campo escolhido para o CNPJ não existe ou não é do tipo texto.');
      }
      base.cnpj = cnpjField;
    }
    const { map, created } = await ensureFields(client, base);
    saveFieldMap(portal.id, map);
    logInfo(portal.id, 'configuracao', created.length ? `${created.length} campos criados no CRM` : 'Campos do CRM verificados', { created: created.map((c) => c.fieldName), cnpjField: map.cnpj }, sessionUser(session));
    const updated = getPortalById(portal.id);
    return { map: updated.fieldMap, created: created.length };
  },
  { admin: true },
);
