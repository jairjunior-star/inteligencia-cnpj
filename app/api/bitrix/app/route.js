import { enterFromBitrix, errorPage } from '@/lib/bitrix-app';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Endereço do aplicativo cadastrado no Bitrix24 (também usado pela aba no cadastro da empresa).
export async function POST(request) {
  try {
    return await enterFromBitrix(request);
  } catch (err) {
    logError(null, 'acesso', `Falha ao abrir pelo Bitrix24: ${err.message}`, { code: err.code });
    return errorPage(err.message || 'Erro inesperado.');
  }
}

export async function GET(request) {
  return POST(request);
}
