import { route } from '@/lib/http';
import { searchBase } from '@/lib/prospect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Busca na base do app por CNAE, segmento, porte, UF, cidade, score e situação.
export const GET = route(async ({ request, portal }) => {
  const sp = new URL(request.url).searchParams;
  return searchBase(portal, {
    q: sp.get('q') || '',
    cnae: sp.get('cnae') || '',
    segment: sp.get('segmento') || '',
    porte: sp.get('porte') || '',
    uf: sp.get('uf') || '',
    city: sp.get('cidade') || '',
    minScore: sp.get('scoreMin') || '',
    grade: sp.get('prioridade') || '',
    ativas: sp.get('ativas') === '1',
    foraDoCrm: sp.get('foraDoCrm') === '1',
    listId: sp.get('lista') || null,
  });
});
