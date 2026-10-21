import { route } from '@/lib/http';
import { stats } from '@/lib/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ portal }) => stats(portal));
