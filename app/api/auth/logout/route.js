import { route, json, clearSessionCookie } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async () => json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() }), { auth: false });
