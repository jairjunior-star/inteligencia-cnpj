import { route, readJson } from '@/lib/http';
import { syncCompanies, listCachedCompanies, registerCompany } from '@/lib/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lista de empresas do CRM (cache local; ?sync=1 força a sincronização com o Bitrix24).
export const GET = route(async ({ request, portal, session }) => {
  const sync = new URL(request.url).searchParams.get('sync');
  if (sync === '1') return syncCompanies(portal, session, { force: true });
  const cached = listCachedCompanies(portal);
  if (!cached.syncedAt) return syncCompanies(portal, session, { force: true });
  return syncCompanies(portal, session, { force: false });
});

// Cadastra uma nova empresa a partir do CNPJ.
export const POST = route(async ({ request, portal, session }) => {
  const { cnpj } = await readJson(request);
  return registerCompany(portal, session, cnpj);
});
