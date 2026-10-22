import { route } from '@/lib/http';
import { getList, deleteList } from '@/lib/prospect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ params, portal }) => getList(portal, params.id));

// Exclui a lista (as empresas já importadas continuam no CRM).
export const DELETE = route(async ({ params, portal, session }) => {
  deleteList(portal, session, params.id);
  return { deleted: true };
});
