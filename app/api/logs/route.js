import { route } from '@/lib/http';
import { listLogs } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LEVELS = ['info', 'aviso', 'erro'];

export const GET = route(async ({ request, portal }) => {
  const level = new URL(request.url).searchParams.get('nivel');
  return { logs: listLogs(portal.id, { limit: 300, level: LEVELS.includes(level) ? level : null }) };
});
