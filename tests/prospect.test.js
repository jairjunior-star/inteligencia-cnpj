import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cnpji-prosp-'));
process.env.APP_SECRET = 'segredo-de-teste-prospeccao-123';

const { extractCnpjs } = await import('../lib/cnpj.js');
const { upsertPortal, saveFieldMap, getPortalById } = await import('../lib/portal.js');
const { createClient } = await import('../lib/bitrix.js');
const { ensureFields } = await import('../lib/crm.js');
const P = await import('../lib/prospect.js');
const { brasilApiSample, jsonResponse, createMockBitrix } = await import('./fixtures.js');

// Três empresas fictícias: software (A), varejo pequeno (C) e uma baixada.
const DB = {
  '11222333000181': brasilApiSample,
  '45321987000184': { ...brasilApiSample, cnpj: '45321987000184', razao_social: 'MERCADO TESTE LTDA', nome_fantasia: 'MERCADO TESTE', cnae_fiscal: 4711302, cnae_fiscal_descricao: 'Supermercados', codigo_porte: 1, porte: 'MICRO EMPRESA', capital_social: 5000, data_inicio_atividade: '2025-12-01', uf: 'SP', municipio: 'CAMPINAS', ddd_telefone_1: '', email: '' },
  '51238476000104': { ...brasilApiSample, cnpj: '51238476000104', razao_social: 'TRANSPORTES BAIXADA LTDA', nome_fantasia: '', descricao_situacao_cadastral: 'BAIXADA', cnae_fiscal: 4930202, uf: 'PA', municipio: 'BELEM' },
};
let cnpjCalls = 0;
const cnpjFetch = async (url) => {
  cnpjCalls++;
  const c = String(url).replace(/\D/g, '').slice(-14);
  if (String(url).includes('cnpj.ws')) return jsonResponse(404, {});
  return DB[c] ? jsonResponse(200, DB[c]) : jsonResponse(404, {});
};

test('extrai CNPJs de texto colado, CSV e Excel sem zeros à esquerda', () => {
  const text = 'CNPJ;Nome\n11.222.333/0001-81;Exemplo\n45321987000184;Mercado\n11222333000181;Repetido\n191;Banco\n123.456.789/0001-00;Inválido\nCampinas\n1234567000195';
  const r = extractCnpjs(text);
  assert.deepEqual(r.valid, ['11222333000181', '45321987000184', '01234567000195'], 'recupera o zero inicial apagado pelo Excel');
  assert.equal(r.duplicates, 1);
  assert.equal(r.invalid.length, 1);
});

test('lista: criar, processar em lotes, buscar e importar com negócio', async () => {
  const bx = createMockBitrix();
  const p0 = upsertPortal({ domain: 'exemplo.bitrix24.com.br', mode: 'webhook', credentials: { webhookUrl: bx.webhookUrl } });
  const session = { pid: p0.id, mode: 'webhook', admin: true, uname: 'Ana' };
  const client = createClient({ type: 'webhook', url: bx.webhookUrl }, { fetchImpl: bx.fetchImpl, minIntervalMs: 0 });
  const { map } = await ensureFields(client, {});
  saveFieldMap(p0.id, map);
  const portal = getPortalById(p0.id);

  assert.throws(() => P.createList(portal, session, '', ['11222333000181']), /nome/);
  assert.throws(() => P.createList(portal, session, 'Vazia', ['123']), /Nenhum CNPJ/);
  const created = P.createList(portal, session, 'Feira 2026', ['11222333000181', '45321987000184', '51238476000104', '00000000000191', '11222333000181']);
  assert.equal(created.total, 4);

  let r = await P.processList(portal, session, created.id, { batch: 3, fetchImpl: cnpjFetch });
  assert.equal(r.done, false);
  r = await P.processList(portal, session, created.id, { batch: 3, fetchImpl: cnpjFetch });
  assert.equal(r.done, true);
  assert.equal(r.counts.pronto, 3);
  assert.equal(r.counts.nao_encontrado, 1);

  const lists = P.listLists(portal);
  assert.equal(lists[0].counts.total, 4);
  const detail = P.getList(portal, created.id);
  assert.equal(detail.items[0].cnpj, '11222333000181', 'ordenado por score');
  assert.equal(detail.items.find((i) => i.cnpj === '00000000000191').status, 'nao_encontrado');

  // Busca na base
  assert.equal(P.searchBase(portal, { cnae: '4711' }).items.length, 1);
  assert.equal(P.searchBase(portal, { cnae: 'supermerc' }).items.length, 1);
  assert.equal(P.searchBase(portal, { uf: 'sp' }).items[0].title, 'MERCADO TESTE');
  assert.equal(P.searchBase(portal, { ativas: true }).items.length, 2);
  assert.equal(P.searchBase(portal, { minScore: 70 }).items.length, 1);
  assert.equal(P.searchBase(portal, { q: '11222' }).items.length, 1);
  const opts = P.searchBase(portal, {}).options;
  assert.ok(opts.ufs.includes('SC') && opts.segments.includes('Comércio'));

  // Funis, etapas (sem ganho/perdido) e usuários vindos do portal
  const pu = await P.getPipelinesAndUsers(portal, session, { bitrixFetch: bx.fetchImpl });
  assert.deepEqual(pu.pipelines.map((p) => p.id), [0, 7]);
  assert.deepEqual(pu.pipelines[1].stages.map((s) => s.id), ['C7:NEW', 'C7:PREPARATION']);
  assert.equal(pu.users[1].name, 'Bruno Lima');

  // Importação: cria empresa + negócio no funil 7, responsável Bruno; pula a baixada
  const imp = await P.importProspects(portal, session, { cnpjs: ['11222333000181', '45321987000184', '51238476000104'], categoryId: 7, stageId: 'C7:NEW', assignedById: 5, listId: created.id }, { fetchImpl: cnpjFetch, bitrixFetch: bx.fetchImpl });
  const st = Object.fromEntries(imp.results.map((x) => [x.cnpj, x.status]));
  assert.deepEqual(st, { '11222333000181': 'importado', '45321987000184': 'importado', '51238476000104': 'inativa' });
  assert.equal(bx.state.deals.length, 2);
  assert.equal(bx.state.deals[0].CATEGORY_ID, 7);
  assert.equal(bx.state.deals[0].STAGE_ID, 'C7:NEW');
  assert.equal(bx.state.deals[0].ASSIGNED_BY_ID, 5);
  const company = [...bx.state.companies.values()].find((c) => c.UF_CRM_CNPJI_CNPJ === '11.222.333/0001-81');
  assert.equal(company.ASSIGNED_BY_ID, 5);
  assert.equal(bx.state.todos.length, 1, 'follow-up só para a prioridade A');
  assert.equal(bx.state.todos[0].responsibleId, 5);

  // Importar de novo não duplica; com dealForExisting cria só o negócio
  const again = await P.importProspects(portal, session, { cnpjs: ['11222333000181'] }, { fetchImpl: cnpjFetch, bitrixFetch: bx.fetchImpl });
  assert.equal(again.results[0].status, 'ja_no_crm');
  assert.equal(bx.state.deals.length, 2);
  const withDeal = await P.importProspects(portal, session, { cnpjs: ['11222333000181'], dealForExisting: true }, { fetchImpl: cnpjFetch, bitrixFetch: bx.fetchImpl });
  assert.equal(withDeal.results[0].dealId, 3);
  assert.equal(bx.state.companies.size, 2, 'nenhuma empresa duplicada');

  const after = P.getList(portal, created.id);
  assert.equal(after.list.counts.importadas, 2);
  assert.ok(after.items.find((i) => i.cnpj === '11222333000181').dealId);

  // Fontes fora do ar: lote pausa sem marcar erro
  const c2 = P.createList(portal, session, 'Outra', ['39012765000187']);
  const down = await P.processList(portal, session, c2.id, { fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(down.pausedBySource, true);
  assert.equal(down.counts.pendente, 1);
  P.deleteList(portal, session, c2.id);
  assert.equal(P.listLists(portal).length, 1);
});
