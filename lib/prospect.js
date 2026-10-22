// Prospecção: listas de CNPJs, enriquecimento em lotes, busca na base e importação para o Bitrix24.
import { getDb, now } from './db.js';
import { validateCnpj, formatCnpj, cleanCnpj } from './cnpj.js';
import { lookupCnpj, CnpjLookupError } from './sources.js';
import { buildIntel } from './intel.js';
import { findCompaniesByCnpj } from './crm.js';
import { clientFor, saveEnrichment, registerCompany } from './service.js';
import { isConfigured } from './portal.js';
import { logInfo, logWarn } from './log.js';
import { HttpError, sessionUser } from './http.js';

export const MAX_LIST_SIZE = 1000;

function requireConfigured(portal) {
  if (!isConfigured(portal)) {
    throw new HttpError(409, 'configuracao_pendente', 'Conclua a configuração (campos do CRM) antes de usar o aplicativo.');
  }
}

function getListRow(portal, id) {
  const row = getDb().prepare('SELECT * FROM lists WHERE id = ? AND portal_id = ?').get(Number(id), portal.id);
  if (!row) throw new HttpError(404, 'nao_encontrado', 'Lista não encontrada.');
  return row;
}

/** Cria uma lista a partir de CNPJs já extraídos e validados no front (valida de novo aqui). */
export function createList(portal, session, name, cnpjs) {
  const title = String(name ?? '').trim().slice(0, 120);
  if (!title) throw new HttpError(400, 'nome_obrigatorio', 'Dê um nome para a lista, por exemplo "Feira do Varejo 2026".');
  const unique = [];
  const seen = new Set();
  let invalid = 0;
  for (const raw of Array.isArray(cnpjs) ? cnpjs : []) {
    const v = validateCnpj(raw);
    if (!v.valid) {
      invalid++;
      continue;
    }
    if (!seen.has(v.cnpj)) {
      seen.add(v.cnpj);
      unique.push(v.cnpj);
    }
  }
  if (!unique.length) throw new HttpError(400, 'lista_vazia', 'Nenhum CNPJ válido encontrado. Cole uma coluna de CNPJs ou envie um arquivo CSV.');
  if (unique.length > MAX_LIST_SIZE) {
    throw new HttpError(400, 'lista_grande', `Cada lista aceita até ${MAX_LIST_SIZE} CNPJs. Divida em listas menores.`);
  }
  const db = getDb();
  db.exec('BEGIN');
  let id;
  try {
    id = Number(db.prepare('INSERT INTO lists (portal_id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(portal.id, title, sessionUser(session), now()).lastInsertRowid);
    const ins = db.prepare('INSERT OR IGNORE INTO list_items (list_id, cnpj) VALUES (?, ?)');
    for (const c of unique) ins.run(id, c);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  logInfo(portal.id, 'prospeccao', `Lista "${title}" criada com ${unique.length} CNPJs`, { listId: id, invalid }, sessionUser(session));
  return { id, total: unique.length, invalid };
}

function listCounts(listId) {
  const rows = getDb().prepare('SELECT status, COUNT(*) AS n FROM list_items WHERE list_id = ? GROUP BY status').all(listId);
  const c = { pendente: 0, pronto: 0, nao_encontrado: 0, erro: 0 };
  for (const r of rows) c[r.status] = r.n;
  const imported = getDb().prepare('SELECT COUNT(*) AS n FROM list_items WHERE list_id = ? AND imported_at IS NOT NULL').get(listId).n;
  return { ...c, total: c.pendente + c.pronto + c.nao_encontrado + c.erro, importadas: imported };
}

export function listLists(portal) {
  return getDb()
    .prepare('SELECT * FROM lists WHERE portal_id = ? ORDER BY created_at DESC')
    .all(portal.id)
    .map((l) => ({ id: l.id, name: l.name, createdBy: l.created_by, createdAt: l.created_at, counts: listCounts(l.id) }));
}

export function deleteList(portal, session, id) {
  const l = getListRow(portal, id);
  const db = getDb();
  db.prepare('DELETE FROM list_items WHERE list_id = ?').run(l.id);
  db.prepare('DELETE FROM lists WHERE id = ?').run(l.id);
  logInfo(portal.id, 'prospeccao', `Lista "${l.name}" excluída (as empresas já importadas continuam no CRM)`, null, sessionUser(session));
}

function crmCnpjs(portalId) {
  return new Map(getDb().prepare('SELECT cnpj, id FROM companies WHERE portal_id = ? AND cnpj IS NOT NULL').all(portalId).map((r) => [r.cnpj, r.id]));
}

function prospectRow(e, crm) {
  const companyId = e.company_id ?? crm.get(e.cnpj) ?? null;
  return {
    cnpj: e.cnpj,
    cnpjFormatado: formatCnpj(e.cnpj),
    title: e.title,
    razao: e.razao,
    cnae: e.cnae,
    cnaeDesc: e.cnae_desc,
    segment: e.segment,
    subsegment: e.subsegment,
    porte: e.porte,
    uf: e.uf,
    city: e.city,
    situacao: e.situacao,
    score: e.score,
    grade: e.grade,
    capital: e.capital,
    abertura: e.abertura,
    phone: e.phone,
    email: e.email,
    companyId,
    updatedAt: e.updated_at,
  };
}

export function getList(portal, id) {
  const l = getListRow(portal, id);
  const crm = crmCnpjs(portal.id);
  const rows = getDb()
    .prepare(
      `SELECT li.id AS item_id, li.cnpj AS item_cnpj, li.status, li.error, li.company_id AS item_company, li.deal_id, li.imported_at, e.*
       FROM list_items li LEFT JOIN enrichments e ON e.portal_id = ? AND e.cnpj = li.cnpj
       WHERE li.list_id = ? ORDER BY COALESCE(e.score, -1) DESC, li.id ASC`,
    )
    .all(portal.id, l.id);
  const items = rows.map((r) => {
    const base = r.cnpj ? prospectRow(r, crm) : { cnpj: r.item_cnpj, cnpjFormatado: formatCnpj(r.item_cnpj) };
    return {
      ...base,
      companyId: r.item_company ?? base.companyId ?? null,
      itemId: r.item_id,
      status: r.status,
      error: r.error,
      dealId: r.deal_id,
      importedAt: r.imported_at,
    };
  });
  return { list: { id: l.id, name: l.name, createdBy: l.created_by, createdAt: l.created_at, counts: listCounts(l.id) }, items };
}

/**
 * Enriquece os próximos itens pendentes (poucos por chamada, para respeitar as APIs públicas).
 * O front chama em sequência até não restar nada; dá para fechar e continuar depois.
 */
export async function processList(portal, session, id, { batch = 3, fetchImpl } = {}) {
  const l = getListRow(portal, id);
  const db = getDb();
  const pending = db.prepare("SELECT id, cnpj FROM list_items WHERE list_id = ? AND status = 'pendente' ORDER BY id LIMIT ?").all(l.id, Math.max(1, Math.min(10, batch)));
  const setStatus = db.prepare('UPDATE list_items SET status = ?, error = ? WHERE id = ?');
  let unavailable = false;
  for (const item of pending) {
    try {
      const r = await lookupCnpj(item.cnpj, { ttlDays: portal.settings.ttlDays, fetchImpl });
      const intel = buildIntel(r.data, portal.settings);
      saveEnrichment(portal.id, null, r.data, intel);
      setStatus.run('pronto', null, item.id);
    } catch (err) {
      if (err instanceof CnpjLookupError && err.code === 'nao_encontrado') {
        setStatus.run('nao_encontrado', 'CNPJ não encontrado na Receita Federal', item.id);
      } else if (err instanceof CnpjLookupError && err.code === 'fontes_indisponiveis') {
        // Bases públicas fora do ar ou limitando: para o lote e deixa pendente para tentar de novo.
        unavailable = true;
        break;
      } else {
        setStatus.run('erro', err.message, item.id);
      }
    }
  }
  const counts = listCounts(l.id);
  if (counts.pendente === 0 && pending.length) {
    logInfo(portal.id, 'prospeccao', `Lista "${l.name}" processada: ${counts.pronto} enriquecidas, ${counts.nao_encontrado} não encontradas, ${counts.erro} com erro`, { listId: l.id }, sessionUser(session));
  }
  return { counts, done: counts.pendente === 0, pausedBySource: unavailable };
}

export function retryErrors(portal, id) {
  const l = getListRow(portal, id);
  const n = getDb().prepare("UPDATE list_items SET status = 'pendente', error = NULL WHERE list_id = ? AND status = 'erro'").run(l.id).changes;
  return { reset: Number(n) };
}

/** Busca na base do app (tudo o que já foi consultado, importado ou listado) com filtros comerciais. */
export function searchBase(portal, f = {}) {
  const where = ['e.portal_id = ?'];
  const args = [portal.id];
  const like = (v) => `%${String(v).trim().toLowerCase()}%`;
  if (f.q) {
    const digits = String(f.q).replace(/\D/g, '');
    where.push(`(lower(e.title) LIKE ? OR lower(COALESCE(e.razao,'')) LIKE ?${digits.length >= 4 ? ' OR e.cnpj LIKE ?' : ''})`);
    args.push(like(f.q), like(f.q));
    if (digits.length >= 4) args.push(`%${digits}%`);
  }
  if (f.cnae) {
    const digits = String(f.cnae).replace(/\D/g, '');
    if (digits.length >= 2) {
      where.push('e.cnae LIKE ?');
      args.push(`${digits}%`);
    } else {
      where.push("lower(COALESCE(e.cnae_desc,'')) LIKE ?");
      args.push(like(f.cnae));
    }
  }
  if (f.segment) {
    where.push('e.segment = ?');
    args.push(f.segment);
  }
  if (f.porte) {
    where.push('e.porte = ?');
    args.push(f.porte);
  }
  if (f.uf) {
    where.push('e.uf = ?');
    args.push(String(f.uf).toUpperCase());
  }
  if (f.city) {
    where.push("lower(COALESCE(e.city,'')) LIKE ?");
    args.push(like(f.city));
  }
  if (f.minScore != null && f.minScore !== '') {
    where.push('e.score >= ?');
    args.push(Number(f.minScore));
  }
  if (f.grade) {
    where.push('e.grade = ?');
    args.push(f.grade);
  }
  if (f.ativas) where.push("e.situacao = 'ATIVA'");
  if (f.listId) {
    where.push('e.cnpj IN (SELECT cnpj FROM list_items WHERE list_id = ?)');
    args.push(Number(f.listId));
  }
  const db = getDb();
  const crm = crmCnpjs(portal.id);
  let rows = db.prepare(`SELECT e.* FROM enrichments e WHERE ${where.join(' AND ')} ORDER BY e.score DESC, e.title ASC LIMIT 2000`).all(...args).map((e) => prospectRow(e, crm));
  if (f.foraDoCrm) rows = rows.filter((r) => !r.companyId);
  const options = {
    segments: db.prepare('SELECT DISTINCT segment FROM enrichments WHERE portal_id = ? AND segment IS NOT NULL ORDER BY segment').all(portal.id).map((r) => r.segment),
    portes: db.prepare('SELECT DISTINCT porte FROM enrichments WHERE portal_id = ? AND porte IS NOT NULL ORDER BY porte').all(portal.id).map((r) => r.porte),
    ufs: db.prepare('SELECT DISTINCT uf FROM enrichments WHERE portal_id = ? AND uf IS NOT NULL ORDER BY uf').all(portal.id).map((r) => r.uf),
    total: db.prepare('SELECT COUNT(*) AS n FROM enrichments WHERE portal_id = ?').get(portal.id).n,
  };
  return { items: rows, options };
}

/** Funis de negócio com as etapas, e usuários ativos — tudo lido do portal, sem IDs fixos. */
export async function getPipelinesAndUsers(portal, session, { bitrixFetch } = {}) {
  requireConfigured(portal);
  const client = clientFor(portal, session, { fetchImpl: bitrixFetch });
  let categories = [];
  try {
    const r = await client.result('crm.category.list', { entityTypeId: 2 });
    categories = (r?.categories ?? []).map((c) => ({ id: Number(c.id), name: c.name, isDefault: c.isDefault === 'Y' || c.isDefault === true }));
  } catch {
    try {
      const r = await client.result('crm.dealcategory.list', {});
      categories = [{ id: 0, name: 'Funil geral', isDefault: true }, ...(r ?? []).map((c) => ({ id: Number(c.ID), name: c.NAME, isDefault: false }))];
    } catch {
      categories = [{ id: 0, name: 'Funil geral', isDefault: true }];
    }
  }
  if (!categories.some((c) => c.id === 0)) categories.unshift({ id: 0, name: 'Funil geral', isDefault: true });
  const pipelines = [];
  for (const c of categories) {
    const entityId = c.id === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${c.id}`;
    let stages = [];
    try {
      const st = await client.result('crm.status.list', { order: { SORT: 'ASC' }, filter: { ENTITY_ID: entityId } });
      stages = (st ?? [])
        .filter((s) => !['S', 'F'].includes(s.EXTRA?.SEMANTICS) && !/(:|^)(WON|LOSE|APOLOGY)$/.test(s.STATUS_ID))
        .map((s) => ({ id: s.STATUS_ID, name: s.NAME }));
    } catch {
      stages = [];
    }
    pipelines.push({ ...c, stages });
  }
  let users = [];
  try {
    users = (await client.list('user.get', { FILTER: { ACTIVE: true } }, 500)).map((u) => ({
      id: Number(u.ID),
      name: [u.NAME, u.LAST_NAME].filter(Boolean).join(' ') || u.EMAIL || `Usuário ${u.ID}`,
    }));
  } catch {
    users = [];
  }
  return { pipelines, users };
}

function dealComments(r) {
  return [
    `Origem: Inteligência de CNPJ (prospecção).`,
    `CNPJ ${formatCnpj(r.cnpj)} · ${r.segment || 'segmento não identificado'}${r.subsegment ? ` / ${r.subsegment}` : ''} · ${r.porte || ''}`,
    `Score de potencial: ${r.score ?? '—'}/100 (prioridade ${r.grade ?? '—'})`,
  ].join('\n');
}

/**
 * Importa CNPJs para o Bitrix24: cria a empresa (com campos, timeline e follow-up) e um negócio no funil/etapa escolhidos.
 * Empresas já existentes não são duplicadas; opcionalmente recebem só o negócio. Empresas inativas são puladas.
 * Processa poucos por chamada; o front repete até terminar.
 */
export async function importProspects(portal, session, opts, { fetchImpl, bitrixFetch } = {}) {
  requireConfigured(portal);
  const cnpjs = (Array.isArray(opts.cnpjs) ? opts.cnpjs : []).map(cleanCnpj).filter((c) => validateCnpj(c).valid).slice(0, 5);
  if (!cnpjs.length) throw new HttpError(400, 'sem_cnpjs', 'Selecione ao menos uma empresa para importar.');
  const createDeal = opts.createDeal !== false;
  const categoryId = opts.categoryId == null || opts.categoryId === '' ? 0 : Number(opts.categoryId);
  const stageId = opts.stageId ? String(opts.stageId) : null;
  const assignedById = opts.assignedById ? Number(opts.assignedById) : null;
  const client = clientFor(portal, session, { fetchImpl: bitrixFetch });
  const db = getDb();
  const results = [];

  for (const cnpj of cnpjs) {
    const out = { cnpj, cnpjFormatado: formatCnpj(cnpj) };
    try {
      const lookup = await lookupCnpj(cnpj, { ttlDays: portal.settings.ttlDays, fetchImpl });
      const intel = buildIntel(lookup.data, portal.settings);
      const title = lookup.data.nomeFantasia || lookup.data.razaoSocial;
      out.title = title;
      if (!intel.ativa) {
        results.push({ ...out, status: 'inativa', message: `Situação ${lookup.data.situacao || 'não ativa'}: não importada.` });
        continue;
      }
      const existing = await findCompaniesByCnpj(client, portal.fieldMap, cnpj);
      let companyId;
      if (existing.length) {
        companyId = existing[0].id;
        out.status = 'ja_no_crm';
        if (!(createDeal && opts.dealForExisting)) {
          results.push({ ...out, companyId, message: 'Já estava no CRM.' });
          if (opts.listId) db.prepare('UPDATE list_items SET company_id = ? WHERE list_id = ? AND cnpj = ?').run(companyId, Number(opts.listId), cnpj);
          continue;
        }
      } else {
        const reg = await registerCompany(portal, session, cnpj, { assignedById, fetchImpl, bitrixFetch });
        companyId = reg.id;
        out.status = 'importado';
        out.followUp = reg.followUp;
      }
      let dealId = null;
      if (createDeal) {
        const row = { cnpj, segment: intel.segmento.segmento, subsegment: intel.segmento.subsegmento, porte: intel.porte.label, score: intel.score, grade: intel.grade };
        dealId = Number(
          await client.result('crm.deal.add', {
            fields: {
              TITLE: `Prospecção: ${title}`,
              COMPANY_ID: companyId,
              CATEGORY_ID: categoryId,
              ...(stageId ? { STAGE_ID: stageId } : {}),
              ...(assignedById ? { ASSIGNED_BY_ID: assignedById } : {}),
              OPENED: 'Y',
              SOURCE_DESCRIPTION: 'Inteligência de CNPJ',
              COMMENTS: dealComments(row),
            },
            params: { REGISTER_SONET_EVENT: 'Y' },
          }),
        );
      }
      if (opts.listId) {
        db.prepare('UPDATE list_items SET company_id = ?, deal_id = COALESCE(?, deal_id), imported_at = ? WHERE list_id = ? AND cnpj = ?').run(companyId, dealId, now(), Number(opts.listId), cnpj);
      }
      results.push({ ...out, companyId, dealId, message: out.status === 'ja_no_crm' ? 'Já estava no CRM: negócio criado.' : 'Empresa e negócio criados.' });
    } catch (err) {
      logWarn(portal.id, 'prospeccao', `Falha ao importar ${formatCnpj(cnpj)}: ${err.message}`);
      results.push({ ...out, status: 'erro', message: err.message });
    }
  }
  const imported = results.filter((r) => r.status === 'importado').length;
  const deals = results.filter((r) => r.dealId).length;
  if (imported || deals) logInfo(portal.id, 'prospeccao', `Importação: ${imported} empresas e ${deals} negócios criados`, { listId: opts.listId ?? null }, sessionUser(session));
  return { results };
}
