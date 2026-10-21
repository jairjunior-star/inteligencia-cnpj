import { route } from '@/lib/http';
import { analyzeCnpj } from '@/lib/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Consulta e análise de um CNPJ (?force=1 ignora o cache e busca de novo na Receita).
export const GET = route(async ({ request, params, portal, session }) => {
  const force = new URL(request.url).searchParams.get('force') === '1';
  return analyzeCnpj(portal, session, decodeURIComponent(params.cnpj), { force });
});
