import { route, readJson } from '@/lib/http';
import { importProspects } from '@/lib/prospect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Importa até 5 CNPJs por chamada: { cnpjs, categoryId, stageId, assignedById, createDeal, dealForExisting, listId }
export const POST = route(async ({ request, portal, session }) => importProspects(portal, session, await readJson(request)));
