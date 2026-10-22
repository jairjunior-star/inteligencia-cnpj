import { route } from '@/lib/http';
import { getPipelinesAndUsers } from '@/lib/prospect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Funis de negócio, etapas e usuários ativos do portal (para escolher onde importar).
export const GET = route(async ({ portal, session }) => getPipelinesAndUsers(portal, session));
