import { route } from '@/lib/http';
import { retryErrors } from '@/lib/prospect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Volta para "pendente" os itens que deram erro, para tentar de novo.
export const POST = route(async ({ params, portal }) => retryErrors(portal, params.id));
