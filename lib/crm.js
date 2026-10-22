// Integração com o CRM do Bitrix24: campos personalizados, busca por CNPJ, cadastro e atualização de empresas.
// Os campos são criados pelo próprio app e localizados pelo XML_ID — nada de IDs fixos.
import { formatCnpj, cleanCnpj } from './cnpj.js';
import { formatCnae } from './sources.js';
import { mergeSettings } from './intel.js';

export const FIELD_DEFS = [
  { key: 'cnpj', xml: 'CNPJI_CNPJ', label: 'CNPJ', type: 'string' },
  { key: 'razao', xml: 'CNPJI_RAZAO', label: 'Razão social', type: 'string' },
  { key: 'situacao', xml: 'CNPJI_SITUACAO', label: 'Situação cadastral', type: 'string' },
  { key: 'abertura', xml: 'CNPJI_ABERTURA', label: 'Data de abertura', type: 'date' },
  { key: 'cnae', xml: 'CNPJI_CNAE', label: 'CNAE principal', type: 'string' },
  { key: 'segmento', xml: 'CNPJI_SEGMENTO', label: 'Segmento', type: 'string' },
  { key: 'porte', xml: 'CNPJI_PORTE', label: 'Porte', type: 'string' },
  { key: 'capital', xml: 'CNPJI_CAPITAL', label: 'Capital social', type: 'double' },
  { key: 'natureza', xml: 'CNPJI_NATUREZA', label: 'Natureza jurídica', type: 'string' },
  { key: 'score', xml: 'CNPJI_SCORE', label: 'Score de potencial', type: 'double' },
  { key: 'classificacao', xml: 'CNPJI_CLASSE', label: 'Prioridade comercial', type: 'string' },
  { key: 'atualizado', xml: 'CNPJI_ATUALIZADO', label: 'Dados da Receita atualizados em', type: 'datetime' },
];

function labelOf(f) {
  const l = f.EDIT_FORM_LABEL ?? f.LIST_COLUMN_LABEL;
  if (!l) return f.FIELD_NAME;
  if (typeof l === 'string') return l;
  return l.br || l.pt || l.en || Object.values(l)[0] || f.FIELD_NAME;
}

/** Lista os campos personalizados de empresa e indica quais do app já existem. */
export async function inspectFields(client, savedMap = {}) {
  const fields = await client.list('crm.company.userfield.list', { order: { SORT: 'ASC' } }, 500);
  const byXml = new Map(fields.filter((f) => f.XML_ID).map((f) => [f.XML_ID, f]));
  const byName = new Map(fields.map((f) => [f.FIELD_NAME, f]));
  const map = {};
  const status = FIELD_DEFS.map((def) => {
    const saved = savedMap[def.key] && byName.get(savedMap[def.key]);
    const found = saved || byXml.get(def.xml);
    if (found) map[def.key] = found.FIELD_NAME;
    return { ...def, fieldName: found?.FIELD_NAME ?? null, exists: Boolean(found), label: found ? labelOf(found) : def.label };
  });
  const cnpjCandidates = fields
    .filter((f) => f.USER_TYPE_ID === 'string')
    .map((f) => ({ fieldName: f.FIELD_NAME, label: labelOf(f), xml: f.XML_ID || null }));
  return { status, map, cnpjCandidates };
}

/** Cria os campos que faltam. Retorna o mapa key -> FIELD_NAME. */
export async function ensureFields(client, savedMap = {}) {
  const { status, map } = await inspectFields(client, savedMap);
  const created = [];
  for (const def of status) {
    if (def.exists) continue;
    const settings = def.type === 'double' ? { PRECISION: def.key === 'capital' ? 2 : 0 } : undefined;
    const id = await client.result('crm.company.userfield.add', {
      fields: {
        FIELD_NAME: def.xml,
        XML_ID: def.xml,
        USER_TYPE_ID: def.type,
        EDIT_FORM_LABEL: def.label,
        LIST_COLUMN_LABEL: def.label,
        LIST_FILTER_LABEL: def.label,
        SHOW_FILTER: 'Y',
        SHOW_IN_LIST: 'Y',
        EDIT_IN_LIST: def.key === 'cnpj' ? 'Y' : 'N',
        MANDATORY: 'N',
        MULTIPLE: 'N',
        ...(settings ? { SETTINGS: settings } : {}),
      },
    });
    map[def.key] = `UF_CRM_${def.xml}`;
    created.push({ key: def.key, id, fieldName: map[def.key] });
  }
  return { map, created };
}

function joinAddress(e) {
  if (!e) return '';
  const rua = [e.tipoLogradouro, e.logradouro].filter(Boolean).join(' ');
  return [rua, e.numero].filter(Boolean).join(', ');
}

function formatCep(cep) {
  const c = String(cep ?? '').replace(/\D/g, '');
  return c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

/** Monta os campos da empresa no CRM a partir dos dados públicos e da inteligência calculada. */
export function buildCompanyFields(company, intel, map, settings, at = new Date()) {
  const s = mergeSettings(settings);
  const title = s.titleFrom === 'razao' ? company.razaoSocial : company.nomeFantasia || company.razaoSocial;
  const e = company.endereco || {};
  const uf = {};
  const put = (key, value) => {
    if (map[key] && value != null && value !== '') uf[map[key]] = value;
  };
  put('cnpj', formatCnpj(company.cnpj));
  put('razao', company.razaoSocial);
  put('situacao', company.situacao);
  put('abertura', company.abertura);
  put('cnae', company.cnaePrincipal ? `${formatCnae(company.cnaePrincipal.codigo)} - ${company.cnaePrincipal.descricao ?? ''}`.trim() : null);
  put('segmento', intel.segmento.subsegmento ? `${intel.segmento.segmento} / ${intel.segmento.subsegmento}` : intel.segmento.segmento);
  put('porte', intel.porte.label);
  put('capital', company.capitalSocial);
  put('natureza', company.naturezaJuridica);
  put('score', intel.score);
  put('classificacao', `${intel.grade} - ${intel.gradeLabel}`);
  put('atualizado', at.toISOString());

  return {
    title,
    uf,
    address: {
      ADDRESS: joinAddress(e),
      ADDRESS_2: [e.complemento, e.bairro].filter(Boolean).join(' - '),
      ADDRESS_CITY: e.cidade || '',
      ADDRESS_POSTAL_CODE: formatCep(e.cep),
      ADDRESS_PROVINCE: e.uf || '',
      ADDRESS_COUNTRY: 'Brasil',
    },
    phones: company.telefones || [],
    email: company.email || null,
  };
}

function digits(v) {
  return String(v ?? '').replace(/\D/g, '');
}

/** Procura empresas no CRM pelo CNPJ (formatado ou só números). */
export async function findCompaniesByCnpj(client, map, cnpj) {
  if (!map.cnpj) return [];
  const clean = cleanCnpj(cnpj);
  const variants = [...new Set([formatCnpj(clean), clean])];
  const seen = new Map();
  for (const v of variants) {
    const rows = await client.list(
      'crm.company.list',
      { filter: { [map.cnpj]: v }, select: ['ID', 'TITLE', 'DATE_MODIFY', map.cnpj] },
      20,
    );
    for (const r of rows) if (cleanCnpj(r[map.cnpj]) === clean) seen.set(String(r.ID), r);
  }
  return [...seen.values()].map((r) => ({ id: Number(r.ID), title: r.TITLE, dateModify: r.DATE_MODIFY }));
}

function multiValues(list) {
  return (Array.isArray(list) ? list : []).map((x) => String(x.VALUE ?? '').trim()).filter(Boolean);
}

/** Campos de criação (crm.company.add). */
export function createPayload(built) {
  const fields = {
    TITLE: built.title,
    COMPANY_TYPE: 'CUSTOMER',
    ...built.address,
    ...built.uf,
  };
  if (built.phones.length) fields.PHONE = built.phones.map((v) => ({ VALUE: v, VALUE_TYPE: 'WORK' }));
  if (built.email) fields.EMAIL = [{ VALUE: built.email, VALUE_TYPE: 'WORK' }];
  return fields;
}

/**
 * Calcula o que muda numa empresa existente. Não sobrescreve o nome nem o endereço já preenchidos
 * (respeita o que o time comercial editou), e só adiciona telefones/e-mails novos.
 */
export function diffForUpdate(current, built, map) {
  const fieldsLabel = Object.fromEntries(FIELD_DEFS.map((d) => [map[d.key], d.label]).filter(([k]) => k));
  const changes = [];
  const fields = {};
  const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

  if (!String(current.TITLE ?? '').trim() && built.title) {
    fields.TITLE = built.title;
    changes.push({ field: 'Nome da empresa', from: '', to: built.title });
  }
  for (const [k, v] of Object.entries(built.uf)) {
    let cur = current[k];
    let next = v;
    // Normaliza datas e números para comparar sem ruído.
    if (k === map.abertura && cur) cur = String(cur).slice(0, 10);
    if (k === map.atualizado) continue; // só grava se outra coisa mudar
    if ((k === map.capital || k === map.score) && cur != null && cur !== '') {
      if (Number(cur) === Number(next)) continue;
    }
    if (k === map.cnpj && cleanCnpj(cur) === cleanCnpj(next)) continue;
    if (!same(cur, next)) {
      fields[k] = next;
      changes.push({ field: fieldsLabel[k] || k, from: cur ?? '', to: next });
    }
  }
  const hasAddress = ['ADDRESS', 'ADDRESS_CITY', 'ADDRESS_POSTAL_CODE'].some((k) => String(current[k] ?? '').trim());
  if (!hasAddress && built.address.ADDRESS) {
    Object.assign(fields, built.address);
    changes.push({ field: 'Endereço', from: '', to: [built.address.ADDRESS, built.address.ADDRESS_CITY, built.address.ADDRESS_PROVINCE].filter(Boolean).join(' - ') });
  }
  const phonesNow = multiValues(current.PHONE).map(digits);
  const newPhones = built.phones.filter((p) => !phonesNow.includes(digits(p)));
  if (newPhones.length) {
    fields.PHONE = newPhones.map((v) => ({ VALUE: v, VALUE_TYPE: 'WORK' }));
    changes.push({ field: 'Telefone (adicionar)', from: '', to: newPhones.join(', ') });
  }
  const emailsNow = multiValues(current.EMAIL).map((e) => e.toLowerCase());
  if (built.email && !emailsNow.includes(built.email.toLowerCase())) {
    fields.EMAIL = [{ VALUE: built.email, VALUE_TYPE: 'WORK' }];
    changes.push({ field: 'E-mail (adicionar)', from: '', to: built.email });
  }
  if (changes.length && map.atualizado) fields[map.atualizado] = built.uf[map.atualizado];
  return { fields, changes };
}

export async function getCompany(client, id) {
  return client.result('crm.company.get', { id: Number(id) });
}

export async function createCompany(client, built) {
  const id = await client.result('crm.company.add', { fields: createPayload(built), params: { REGISTER_SONET_EVENT: 'N' } });
  return Number(id);
}

export async function updateCompany(client, id, fields) {
  return client.result('crm.company.update', { id: Number(id), fields, params: { REGISTER_SONET_EVENT: 'N' } });
}

export async function addTimelineComment(client, companyId, text) {
  return client.result('crm.timeline.comment.add', {
    fields: { ENTITY_ID: Number(companyId), ENTITY_TYPE: 'company', COMMENT: text },
  });
}

export function timelineText(company, intel, action) {
  const lines = [
    `Inteligência de CNPJ: ${action}.`,
    `CNPJ ${formatCnpj(company.cnpj)} | ${company.situacao || 'situação não informada'}`,
    `Segmento: ${intel.segmento.segmento}${intel.segmento.subsegmento ? ` / ${intel.segmento.subsegmento}` : ''} | Porte: ${intel.porte.label}`,
    `Score de potencial: ${intel.score}/100 (${intel.grade} - ${intel.gradeLabel})`,
  ];
  if (intel.approach[0]) lines.push(`Sugestão: ${intel.approach[0]}`);
  return lines.join('\n');
}

/**
 * Cria um "a fazer" de follow-up na empresa (crm.activity.todo.add, escopo crm).
 * Em portais sem esse método, cria uma tarefa vinculada à empresa (tasks.task.add, escopo task).
 */
export async function createFollowUp(client, companyId, { title, description, deadline, responsibleId }) {
  try {
    const r = await client.result('crm.activity.todo.add', {
      ownerTypeId: 4, // 4 = empresa
      ownerId: Number(companyId),
      deadline,
      title,
      description,
      ...(responsibleId ? { responsibleId: Number(responsibleId) } : {}),
    });
    return { type: 'todo', id: Number(r?.id ?? r) || null };
  } catch (err) {
    if (!['ERROR_METHOD_NOT_FOUND', 'insufficient_scope', 'ERROR_CORE'].includes(err.code)) throw err;
    const r = await client.result('tasks.task.add', {
      fields: {
        TITLE: title,
        DESCRIPTION: description,
        DEADLINE: deadline,
        ...(responsibleId ? { RESPONSIBLE_ID: Number(responsibleId) } : {}),
        UF_CRM_TASK: [`CO_${Number(companyId)}`],
      },
    });
    return { type: 'task', id: Number(r?.task?.id ?? r?.id) || null };
  }
}

export function followUpText(company, intel) {
  const nome = company.nomeFantasia || company.razaoSocial;
  const title = `Prospectar ${nome} (prioridade A · score ${intel.score})`;
  const lines = [
    `Empresa com alto potencial identificada pela Inteligência de CNPJ.`,
    `Segmento: ${intel.segmento.segmento}${intel.segmento.subsegmento ? ` / ${intel.segmento.subsegmento}` : ''} · Porte: ${intel.porte.label}`,
    ...intel.approach.map((a) => `- ${a}`),
  ];
  return { title, description: lines.join('\n') };
}

/** Lista empresas do CRM com o campo CNPJ (para a tela de atualização em lote). */
export async function listCompanies(client, map, max = 2000) {
  const select = ['ID', 'TITLE', 'DATE_MODIFY'];
  if (map.cnpj) select.push(map.cnpj);
  if (map.atualizado) select.push(map.atualizado);
  const rows = await client.list('crm.company.list', { order: { ID: 'DESC' }, select }, max);
  return rows.map((r) => ({
    id: Number(r.ID),
    title: r.TITLE,
    dateModify: r.DATE_MODIFY,
    cnpj: map.cnpj ? cleanCnpj(r[map.cnpj]) || null : null,
    enrichedAt: map.atualizado ? r[map.atualizado] || null : null,
  }));
}
