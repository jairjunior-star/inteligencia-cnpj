import { route, readJson } from '@/lib/http';
import { listLists, createList } from '@/lib/prospect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Listas de prospecção do portal.
export const GET = route(async ({ portal }) => ({ lists: listLists(portal) }));

// Cria uma lista: { name, cnpjs: [...] }
export const POST = route(async ({ request, portal, session }) => {
  const { name, cnpjs } = await readJson(request);
  return createList(portal, session, name, cnpjs);
});
