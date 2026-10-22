import { route } from '@/lib/http';
import { processList } from '@/lib/prospect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Enriquece o próximo lote de CNPJs pendentes. O front chama em sequência até terminar.
export const POST = route(async ({ params, portal, session }) => processList(portal, session, params.id, { batch: 3 }));
