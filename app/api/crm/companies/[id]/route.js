import { route, readJson, HttpError } from '@/lib/http';
import { enrichCompany } from '@/lib/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function companyId(params) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id_invalido', 'Empresa inválida.');
  return id;
}

// Prévia do que muda (?cnpj= para empresas sem CNPJ; ?force=1 para buscar de novo na Receita).
export const GET = route(async ({ request, params, portal, session }) => {
  const sp = new URL(request.url).searchParams;
  return enrichCompany(portal, session, companyId(params), { cnpj: sp.get('cnpj') || null, force: sp.get('force') === '1' });
});

// Aplica a atualização.
export const POST = route(async ({ request, params, portal, session }) => {
  const body = await readJson(request);
  return enrichCompany(portal, session, companyId(params), { cnpj: body.cnpj || null, apply: true });
});
