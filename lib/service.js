// Regras de negócio: consulta + inteligência + CRM, com cache, histórico e logs.
import { getDb, now } from './db.js';
import { validateCnpj, formatCnpj, cleanCnpj } from './cnpj.js';
import { lookupCnpj } from './sources.js';
import { buildIntel } from './intel.js';
import { createClient } from './bitrix.js';
import { connectionFor, isConfigured } from './portal.js';
import {
  buildCompanyFields,
  findCompaniesByCnpj,
  createCompany,
  getCompany,
  diffForUpdate,
  updateCompany,
  addTimelineComment,
  timelineText,
  listCompanies,
} from './crm.js';
import { logInfo, logWarn } from './log.js';
import { HttpError, sessionUser } from './http.js';

const COMPANIES_TTL_MS = 10 * 60 * 1000;

export function clientFor(portal, session, opts) {
  return createClient(connectionFor(portal, session), opts);
}

function requireConfigured(portal) {
  if (!isConfigured(portal)) {
    throw new HttpError(409, 'configuracao_pendente', 'Conclua a configuração (campos do CRM) antes de usar o aplicativo.');
  }
}

function saveEnrichment(portalId, companyId, data, intel) {
  getDb()
    .prepare(
      `INSERT INTO enrichments (portal_id, cnpj, company_id, title, segment, porte, uf, city, situacao, score, grade, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(portal_id, cnpj) DO UPDATE SET company_id = COALESCE(excluded.company_id, company_id), title = excluded.title,
         segment = excluded.segment, porte = excluded.porte, uf = excluded.uf, city = excluded.city, situacao = excluded.situacao,
         score = excluded.score, grade = excluded.grade, updated_at = excluded.updated_at`,
    )
    .run(
      portalId,
      data.cnpj,
      companyId ?? null,
      data.nomeFantasia || data.razaoSocial,
      intel.segmento.segmento,
      intel.porte.label,
      data.endereco?.uf ?? null,
      data.endereco?.cidade ?? null,
      data.situacao,
      intel.score,
      intel.grade,
      now(),
    );
}

function touchCompanyCache(portalId, companyId, title, cnpj) {
  getDb()
    .prepare(
      `INSERT INTO companies (portal_id, id, title, cnpj, enriched_at, date_modify, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(portal_id, id) DO UPDATE SET title = COALESCE(excluded.title, title), cnpj = excluded.cnpj, enriched_at = excluded.enriched_at, synced_at = excluded.synced_at`,
    )
    .run(portalId, companyId, title ?? null, cnpj, new Date().toISOString(), new Date().toISOString(), now());
}

/** Consulta o CNPJ, calcula a inteligência e verifica se a empresa já existe no CRM. */
export async function analyzeCnpj(portal, session, cnpjInput, { force = false, fetchImpl, bitrixFetch } = {}) {
  const lookup = await lookupCnpj(cnpjInput, { ttlDays: portal.settings.ttlDays, force, fetchImpl });
  const intel = buildIntel(lookup.data, portal.settings);
  let matches = [];
  let crmError = null;
  if (isConfigured(portal)) {
    try {
      matches = await findCompaniesByCnpj(clientFor(portal, session, { fetchImpl: bitrixFetch }), portal.fieldMap, lookup.data.cnpj);
    } catch (err) {
      crmError = err.message;
    }
  }
  logInfo(portal.id, 'consulta', `Consulta do CNPJ ${formatCnpj(lookup.data.cnpj)}${lookup.cached ? ' (cache local)' : ` (${lookup.source})`}`, { score: intel.score }, sessionUser(session));
  return {
    cnpj: lookup.data.cnpj,
    cnpjFormatado: formatCnpj(lookup.data.cnpj),
    data: lookup.data,
    intel,
    source: { id: lookup.source, cached: lookup.cached, stale: Boolean(lookup.stale), fetchedAt: lookup.fetchedAt },
    crm: { matches, error: crmError },
  };
}

/** Cadastra a empresa no CRM a partir do CNPJ. Bloqueia duplicidade. */
export async function registerCompany(portal, session, cnpjInput, { allowDuplicate = false, fetchImpl, bitrixFetch } = {}) {
  requireConfigured(portal);
  const v = validateCnpj(cnpjInput);
  if (!v.valid) throw new HttpError(400, 'cnpj_invalido', v.reason);
  const client = clientFor(portal, session, { fetchImpl: bitrixFetch });
  const existing = await findCompaniesByCnpj(client, portal.fieldMap, v.cnpj);
  if (existing.length && !allowDuplicate) {
    const e = new HttpError(409, 'empresa_existente', `Este CNPJ já está no CRM: ${existing[0].title} (#${existing[0].id}). Use "Atualizar".`);
    e.details = existing;
    throw e;
  }
  const lookup = await lookupCnpj(v.cnpj, { ttlDays: portal.settings.ttlDays, fetchImpl });
  const intel = buildIntel(lookup.data, portal.settings);
  const built = buildCompanyFields(lookup.data, intel, portal.fieldMap, portal.settings);
  const id = await createCompany(client, built);
  if (portal.settings.timelineComment) {
    try {
      await addTimelineComment(client, id, timelineText(lookup.data, intel, 'empresa cadastrada a partir do CNPJ'));
    } catch (err) {
      logWarn(portal.id, 'timeline', `Empresa #${id} criada, mas o comentário na timeline falhou: ${err.message}`);
    }
  }
  saveEnrichment(portal.id, id, lookup.data, intel);
  touchCompanyCache(portal.id, id, built.title, v.cnpj);
  logInfo(portal.id, 'cadastro', `Empresa "${built.title}" (#${id}) cadastrada pelo CNPJ ${formatCnpj(v.cnpj)}`, { companyId: id, score: intel.score }, sessionUser(session));
  return { id, title: built.title, intel: { score: intel.score, grade: intel.grade, gradeLabel: intel.gradeLabel } };
}

function companySummary(c, map) {
  return {
    id: Number(c.ID),
    title: c.TITLE,
    cnpj: map.cnpj ? cleanCnpj(c[map.cnpj]) || null : null,
    enrichedAt: map.atualizado ? c[map.atualizado] || null : null,
    dateModify: c.DATE_MODIFY,
  };
}

/**
 * Prévia (apply=false) ou aplicação (apply=true) da atualização de uma empresa existente.
 * Se a empresa não tem CNPJ, use o parâmetro cnpj para informar e gravar.
 */
export async function enrichCompany(portal, session, companyId, { cnpj = null, apply = false, force = false, fetchImpl, bitrixFetch } = {}) {
  requireConfigured(portal);
  const client = clientFor(portal, session, { fetchImpl: bitrixFetch });
  const current = await getCompany(client, companyId);
  if (!current) throw new HttpError(404, 'nao_encontrado', 'Empresa não encontrada no CRM.');
  const summary = companySummary(current, portal.fieldMap);
  const cnpjToUse = cnpj ? cleanCnpj(cnpj) : summary.cnpj;
  if (!cnpjToUse) {
    return { company: summary, needsCnpj: true, changes: [] };
  }
  const v = validateCnpj(cnpjToUse);
  if (!v.valid) throw new HttpError(400, 'cnpj_invalido', `CNPJ da empresa inválido: ${v.reason}`);
  const lookup = await lookupCnpj(v.cnpj, { ttlDays: portal.settings.ttlDays, force, fetchImpl });
  const intel = buildIntel(lookup.data, portal.settings);
  const built = buildCompanyFields(lookup.data, intel, portal.fieldMap, portal.settings);
  // Se o CNPJ foi informado agora, garante que ele seja gravado.
  if (cnpj && portal.fieldMap.cnpj) built.uf[portal.fieldMap.cnpj] = formatCnpj(v.cnpj);
  const { fields, changes } = diffForUpdate(current, built, portal.fieldMap);

  const base = {
    company: summary,
    cnpj: v.cnpj,
    cnpjFormatado: formatCnpj(v.cnpj),
    data: lookup.data,
    intel,
    source: { id: lookup.source, cached: lookup.cached, stale: Boolean(lookup.stale), fetchedAt: lookup.fetchedAt },
    changes,
  };
  if (!apply) return base;

  if (changes.length) {
    await updateCompany(client, companyId, fields);
    if (portal.settings.timelineComment) {
      try {
        await addTimelineComment(client, companyId, timelineText(lookup.data, intel, `dados atualizados (${changes.length} ${changes.length === 1 ? 'campo' : 'campos'})`));
      } catch (err) {
        logWarn(portal.id, 'timeline', `Comentário na timeline da empresa #${companyId} falhou: ${err.message}`);
      }
    }
    logInfo(portal.id, 'atualizacao', `Empresa "${summary.title}" (#${companyId}) atualizada: ${changes.map((c) => c.field).join(', ')}`, { companyId, changes: changes.length }, sessionUser(session));
  } else {
    logInfo(portal.id, 'atualizacao', `Empresa "${summary.title}" (#${companyId}) já estava em dia`, { companyId }, sessionUser(session));
  }
  saveEnrichment(portal.id, Number(companyId), lookup.data, intel);
  touchCompanyCache(portal.id, Number(companyId), summary.title, v.cnpj);
  return { ...base, applied: true, updated: changes.length > 0 };
}

/** Sincroniza a lista de empresas do CRM com o cache local (no máximo a cada 10 minutos, salvo force). */
export async function syncCompanies(portal, session, { force = false, bitrixFetch } = {}) {
  requireConfigured(portal);
  const db = getDb();
  const state = db.prepare('SELECT companies_synced_at FROM sync_state WHERE portal_id = ?').get(portal.id);
  const fresh = state?.companies_synced_at && now() - state.companies_synced_at < COMPANIES_TTL_MS;
  if (!fresh || force) {
    const rows = await listCompanies(clientFor(portal, session, { fetchImpl: bitrixFetch }), portal.fieldMap);
    const t = now();
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM companies WHERE portal_id = ?').run(portal.id);
      const ins = db.prepare('INSERT INTO companies (portal_id, id, title, cnpj, enriched_at, date_modify, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const r of rows) ins.run(portal.id, r.id, r.title, r.cnpj, r.enrichedAt, r.dateModify, t);
      db.prepare('INSERT INTO sync_state (portal_id, companies_synced_at) VALUES (?, ?) ON CONFLICT(portal_id) DO UPDATE SET companies_synced_at = excluded.companies_synced_at').run(portal.id, t);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    logInfo(portal.id, 'sincronizacao', `${rows.length} empresas sincronizadas com o Bitrix24`, null, sessionUser(session));
  }
  return listCachedCompanies(portal);
}

export function listCachedCompanies(portal) {
  const db = getDb();
  const state = db.prepare('SELECT companies_synced_at FROM sync_state WHERE portal_id = ?').get(portal.id);
  const staleMs = portal.settings.staleDays * 86400000;
  const rows = db.prepare('SELECT id, title, cnpj, enriched_at, date_modify FROM companies WHERE portal_id = ? ORDER BY id DESC').all(portal.id);
  const scores = new Map(
    db.prepare('SELECT cnpj, score, grade, segment FROM enrichments WHERE portal_id = ?').all(portal.id).map((r) => [r.cnpj, r]),
  );
  const companies = rows.map((r) => {
    const enrichedMs = r.enriched_at ? Date.parse(r.enriched_at) : NaN;
    let status = 'sem_cnpj';
    if (r.cnpj) status = !Number.isFinite(enrichedMs) ? 'nunca' : now() - enrichedMs > staleMs ? 'desatualizada' : 'atualizada';
    const e = r.cnpj ? scores.get(r.cnpj) : null;
    return { id: r.id, title: r.title, cnpj: r.cnpj, cnpjFormatado: r.cnpj ? formatCnpj(r.cnpj) : null, enrichedAt: r.enriched_at, status, score: e?.score ?? null, grade: e?.grade ?? null, segment: e?.segment ?? null };
  });
  return { syncedAt: state?.companies_synced_at ?? null, companies };
}

function group(rows, key, limit = 8) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] || 'Não informado';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, count]) => ({ label, count }));
}

export function stats(portal) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM enrichments WHERE portal_id = ?').all(portal.id);
  const { companies, syncedAt } = listCachedCompanies(portal);
  const ativos = rows.filter((r) => r.situacao === 'ATIVA');
  const avg = ativos.length ? Math.round(ativos.reduce((a, r) => a + (r.score || 0), 0) / ativos.length) : null;
  const top = [...ativos].sort((a, b) => b.score - a.score).slice(0, 8).map((r) => ({ cnpj: r.cnpj, cnpjFormatado: formatCnpj(r.cnpj), title: r.title, score: r.score, grade: r.grade, segment: r.segment, companyId: r.company_id }));
  const since = now() - 7 * 86400000;
  const recent = db.prepare("SELECT COUNT(*) AS n FROM logs WHERE portal_id = ? AND action IN ('cadastro','atualizacao') AND at > ?").get(portal.id, since).n;
  return {
    enriquecidas: rows.length,
    scoreMedio: avg,
    prioridade: { A: ativos.filter((r) => r.grade === 'A').length, B: ativos.filter((r) => r.grade === 'B').length, C: ativos.filter((r) => r.grade === 'C').length },
    inativas: rows.length - ativos.length,
    porSegmento: group(rows, 'segment'),
    porPorte: group(rows, 'porte'),
    porUf: group(rows, 'uf'),
    top,
    crm: {
      syncedAt,
      total: companies.length,
      semCnpj: companies.filter((c) => c.status === 'sem_cnpj').length,
      desatualizadas: companies.filter((c) => c.status === 'desatualizada' || c.status === 'nunca').length,
      atualizadas: companies.filter((c) => c.status === 'atualizada').length,
    },
    operacoes7dias: recent,
  };
}
