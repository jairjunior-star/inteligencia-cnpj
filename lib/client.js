// Chamadas do front para as rotas /api. Dentro do Bitrix24 envia a sessão pelo cabeçalho.
export const SESSION_STORAGE_KEY = 'cnpji_session';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function storedSession() {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function api(path, { method = 'GET', body, redirectOnAuth = true } = {}) {
  const headers = { accept: 'application/json' };
  const token = typeof window !== 'undefined' ? storedSession() : null;
  if (token) headers['x-cnpji-session'] = token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'rede', 'Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data || data.ok === false) {
    const err = data?.error || {};
    if (redirectOnAuth && res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/entrar';
    }
    if (redirectOnAuth && res.status === 409 && err.code === 'configuracao_pendente' && typeof window !== 'undefined') {
      window.location.href = '/configuracao';
    }
    throw new ApiError(res.status, err.code || 'erro', err.message || 'Algo deu errado. Tente novamente.', data?.details);
  }
  return data;
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  const d = typeof value === 'number' ? new Date(value) : new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return withTime
    ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR');
}

export function formatMoney(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
