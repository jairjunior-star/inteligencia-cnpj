import { installPage } from '@/lib/bitrix-app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Endereço de instalação cadastrado no Bitrix24.
export async function POST() {
  return installPage();
}

export async function GET() {
  return installPage();
}
