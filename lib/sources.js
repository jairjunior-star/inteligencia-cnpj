// Consulta de CNPJ em bases públicas gratuitas, com cache local.
// Fonte principal: BrasilAPI (dados abertos da Receita Federal). Reserva: CNPJ.ws (API pública).
// Os dados ficam em cache no SQLite para evitar consultas repetidas.
import { getDb, now } from './db.js';
import { validateCnpj } from './cnpj.js';

export class CnpjLookupError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const TIMEOUT_MS = 12000;

function toNumber(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function cleanText(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s && s !== '********' ? s : null;
}

function isoDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function phoneFrom(ddd, number) {
  const digits = `${ddd ?? ''}${number ?? ''}`.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const d = digits.slice(0, 2);
  const n = digits.slice(2);
  return n.length === 9 ? `(${d}) ${n.slice(0, 5)}-${n.slice(5)}` : `(${d}) ${n.slice(0, 4)}-${n.slice(4)}`;
}

function cnaeCode(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d ? d.padStart(7, '0') : null;
}

export function formatCnae(code) {
  const c = cnaeCode(code);
  if (!c) return '';
  return `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5, 7)}`;
}

/** Normaliza o porte informado pela Receita em ME | EPP | DEMAIS | NAO_INFORMADO. */
export function normalizePorte(raw) {
  const s = String(raw ?? '').toUpperCase();
  if (/^0?1$/.test(s) || s.includes('MICRO')) return 'ME';
  if (/^0?3$/.test(s) || s.includes('PEQUENO')) return 'EPP';
  if (/^0?5$/.test(s) || s.includes('DEMAIS')) return 'DEMAIS';
  return 'NAO_INFORMADO';
}

function yesNo(v) {
  if (v === true || v === false) return v;
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s === 'sim' || s === 's' || s === 'true') return true;
  if (s === 'não' || s === 'nao' || s === 'n' || s === 'false') return false;
  return null;
}

export function normalizeBrasilApi(d) {
  const telefones = [phoneFrom(null, d.ddd_telefone_1), phoneFrom(null, d.ddd_telefone_2)].filter(Boolean);
  return {
    cnpj: String(d.cnpj ?? '').replace(/[^0-9A-Z]/gi, '').toUpperCase(),
    razaoSocial: cleanText(d.razao_social),
    nomeFantasia: cleanText(d.nome_fantasia),
    situacao: cleanText(d.descricao_situacao_cadastral)?.toUpperCase() ?? null,
    situacaoData: isoDate(d.data_situacao_cadastral),
    motivoSituacao: cleanText(d.descricao_motivo_situacao_cadastral),
    abertura: isoDate(d.data_inicio_atividade),
    matriz: d.identificador_matriz_filial == null ? null : Number(d.identificador_matriz_filial) === 1,
    naturezaJuridica: cleanText(d.natureza_juridica),
    porte: normalizePorte(d.codigo_porte ?? d.porte),
    porteDescricao: cleanText(d.porte),
    mei: yesNo(d.opcao_pelo_mei),
    simples: yesNo(d.opcao_pelo_simples),
    capitalSocial: toNumber(d.capital_social),
    cnaePrincipal: d.cnae_fiscal ? { codigo: cnaeCode(d.cnae_fiscal), descricao: cleanText(d.cnae_fiscal_descricao) } : null,
    cnaesSecundarios: (d.cnaes_secundarios ?? [])
      .filter((c) => c && Number(c.codigo))
      .map((c) => ({ codigo: cnaeCode(c.codigo), descricao: cleanText(c.descricao) })),
    endereco: {
      tipoLogradouro: cleanText(d.descricao_tipo_de_logradouro),
      logradouro: cleanText(d.logradouro),
      numero: cleanText(d.numero),
      complemento: cleanText(d.complemento),
      bairro: cleanText(d.bairro),
      cidade: cleanText(d.municipio),
      uf: cleanText(d.uf)?.toUpperCase() ?? null,
      cep: String(d.cep ?? '').replace(/\D/g, '') || null,
    },
    telefones,
    email: cleanText(d.email)?.toLowerCase() ?? null,
    socios: (d.qsa ?? []).map((s) => ({
      nome: cleanText(s.nome_socio),
      qualificacao: cleanText(s.qualificacao_socio),
      desde: isoDate(s.data_entrada_sociedade),
    })),
    fonte: 'BrasilAPI (Receita Federal)',
  };
}

export function normalizeCnpjWs(d) {
  const e = d.estabelecimento ?? {};
  const telefones = [phoneFrom(e.ddd1, e.telefone1), phoneFrom(e.ddd2, e.telefone2)].filter(Boolean);
  const principal = e.atividade_principal;
  return {
    cnpj: String(e.cnpj ?? '').replace(/[^0-9A-Z]/gi, '').toUpperCase(),
    razaoSocial: cleanText(d.razao_social),
    nomeFantasia: cleanText(e.nome_fantasia),
    situacao: cleanText(e.situacao_cadastral)?.toUpperCase() ?? null,
    situacaoData: isoDate(e.data_situacao_cadastral),
    motivoSituacao: cleanText(e.motivo_situacao_cadastral?.descricao ?? e.motivo_situacao_cadastral),
    abertura: isoDate(e.data_inicio_atividade),
    matriz: e.tipo ? String(e.tipo).toLowerCase() === 'matriz' : null,
    naturezaJuridica: cleanText(d.natureza_juridica?.descricao),
    porte: normalizePorte(d.porte?.id ?? d.porte?.descricao),
    porteDescricao: cleanText(d.porte?.descricao),
    mei: yesNo(d.simples?.mei),
    simples: yesNo(d.simples?.simples),
    capitalSocial: toNumber(d.capital_social),
    cnaePrincipal: principal ? { codigo: cnaeCode(principal.id ?? principal.subclasse), descricao: cleanText(principal.descricao) } : null,
    cnaesSecundarios: (e.atividades_secundarias ?? []).map((c) => ({
      codigo: cnaeCode(c.id ?? c.subclasse),
      descricao: cleanText(c.descricao),
    })),
    endereco: {
      tipoLogradouro: cleanText(e.tipo_logradouro),
      logradouro: cleanText(e.logradouro),
      numero: cleanText(e.numero),
      complemento: cleanText(e.complemento),
      bairro: cleanText(e.bairro),
      cidade: cleanText(e.cidade?.nome),
      uf: cleanText(e.estado?.sigla)?.toUpperCase() ?? null,
      cep: String(e.cep ?? '').replace(/\D/g, '') || null,
    },
    telefones,
    email: cleanText(e.email)?.toLowerCase() ?? null,
    socios: (d.socios ?? []).map((s) => ({
      nome: cleanText(s.nome),
      qualificacao: cleanText(s.qualificacao_socio?.descricao),
      desde: isoDate(s.data_entrada),
    })),
    fonte: 'CNPJ.ws (Receita Federal)',
  };
}

async function fetchJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': 'InteligenciaCNPJ/1.0 (Bitrix24)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

export const SOURCES = [
  {
    id: 'brasilapi',
    url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}`,
    normalize: normalizeBrasilApi,
  },
  {
    id: 'cnpjws',
    url: (c) => `https://publica.cnpj.ws/cnpj/${c}`,
    normalize: normalizeCnpjWs,
  },
];

/** Consulta as fontes em ordem. 404 em uma fonte = CNPJ não encontrado; erro/limite = tenta a próxima. */
export async function fetchFromSources(cnpj, { fetchImpl = fetch, sources = SOURCES } = {}) {
  const failures = [];
  let notFound = 0;
  for (const src of sources) {
    try {
      const { status, body } = await fetchJson(src.url(cnpj), fetchImpl);
      if (status === 200 && body) {
        const data = src.normalize(body);
        if (data.razaoSocial) return { source: src.id, data };
        failures.push(`${src.id}: resposta sem dados`);
      } else if (status === 404 || status === 400) {
        notFound++;
        failures.push(`${src.id}: não encontrado`);
      } else {
        failures.push(`${src.id}: HTTP ${status}`);
      }
    } catch (err) {
      failures.push(`${src.id}: ${err.name === 'TimeoutError' ? 'tempo esgotado' : err.message}`);
    }
  }
  if (notFound === sources.length) {
    throw new CnpjLookupError('nao_encontrado', 'CNPJ não encontrado nas bases públicas da Receita Federal.', 404);
  }
  const err = new CnpjLookupError(
    'fontes_indisponiveis',
    'Não foi possível consultar as bases públicas agora. Tente novamente em alguns instantes.',
    503,
  );
  err.details = failures;
  throw err;
}

/** Consulta com cache local. ttlDays define por quanto tempo o dado em cache é considerado atual. */
export async function lookupCnpj(value, { ttlDays = 30, force = false, fetchImpl = fetch } = {}) {
  const v = validateCnpj(value);
  if (!v.valid) throw new CnpjLookupError('cnpj_invalido', v.reason, 400);
  const db = getDb();
  const row = db.prepare('SELECT * FROM cnpj_cache WHERE cnpj = ?').get(v.cnpj);
  const maxAge = Math.max(0, Number(ttlDays) || 0) * 86400000;
  if (row && !force && now() - row.fetched_at < maxAge) {
    return { cached: true, source: row.source, fetchedAt: row.fetched_at, data: JSON.parse(row.data) };
  }
  try {
    const { source, data } = await fetchFromSources(v.cnpj, { fetchImpl });
    const fetchedAt = now();
    db.prepare(
      'INSERT INTO cnpj_cache (cnpj, source, data, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(cnpj) DO UPDATE SET source = excluded.source, data = excluded.data, fetched_at = excluded.fetched_at',
    ).run(v.cnpj, source, JSON.stringify(data), fetchedAt);
    return { cached: false, source, fetchedAt, data };
  } catch (err) {
    // Fontes fora do ar: se houver cache antigo, usa e avisa.
    if (row && err.code === 'fontes_indisponiveis') {
      return { cached: true, stale: true, source: row.source, fetchedAt: row.fetched_at, data: JSON.parse(row.data) };
    }
    throw err;
  }
}
