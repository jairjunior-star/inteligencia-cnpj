import { route, getSession } from '@/lib/http';
import { getPortalById, countPortals, isConfigured } from '@/lib/portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Quem está usando o app e em que estado está a configuração (não exige login).
export const GET = route(
  async ({ request }) => {
    const session = getSession(request);
    const portal = session ? getPortalById(session.pid) : null;
    if (!session || !portal) {
      return { authenticated: false, hasPortals: countPortals() > 0 };
    }
    return {
      authenticated: true,
      user: { name: session.uname, admin: Boolean(session.admin), mode: session.mode },
      portal: { domain: portal.domain, mode: portal.mode, configured: isConfigured(portal), placementBound: portal.placementBound },
    };
  },
  { auth: false },
);
