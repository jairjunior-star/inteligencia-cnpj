import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verificação simples para a hospedagem (banco acessível).
export async function GET() {
  try {
    getDb().prepare('SELECT 1').get();
    return Response.json({ ok: true, app: 'inteligencia-cnpj', node: process.version });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
