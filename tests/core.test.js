import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cnpji-'));
process.env.DATA_DIR = tmp;
process.env.APP_SECRET = 'segredo-de-teste-com-mais-de-16';

const { validateCnpj, formatCnpj, maskCnpjInput } = await import('../lib/cnpj.js');
const { normalizeBrasilApi, normalizeCnpjWs, lookupCnpj, fetchFromSources } = await import('../lib/sources.js');
const { buildIntel, classifySegment, classifyPorte } = await import('../lib/intel.js');
const { encrypt, decrypt, sign, verify, hashPassword, verifyPassword } = await import('../lib/crypto.js');
const { parseWebhookUrl, createClient } = await import('../lib/bitrix.js');
const { ensureFields, buildCompanyFields, diffForUpdate } = await import('../lib/crm.js');
const { upsertPortal, saveFieldMap, getPortalById, connectionFor } = await import('../lib/portal.js');
const { analyzeCnpj, registerCompany, enrichCompany, syncCompanies, stats } = await import('../lib/service.js');
const { listLogs } = await import('../lib/log.js');
const { brasilApiSample, cnpjWsSample, jsonResponse, createMockBitrix } = await import('./fixtures.js');

test('valida CNPJ numérico e alfanumérico', () => {
  assert.equal(validateCnpj('11.222.333/0001-81').valid, true);
  assert.equal(validateCnpj('00.000.000/0001-91').valid, true);
  assert.equal(validateCnpj('11.222.333/0001-82').valid, false);
  assert.equal(validateCnpj('11111111111111').valid, false);
  assert.equal(validateCnpj('123').valid, false);
  // Exemplo oficial da Receita Federal para o CNPJ alfanumérico
  assert.equal(validateCnpj('12.ABC.345/01DE-35').valid, true);
  assert.equal(validateCnpj('12.ABC.345/01DE-36').valid, false);
  assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81');
  assert.equal(maskCnpjInput('1122233300'), '11.222.333/00');
});

test('normaliza BrasilAPI e CNPJ.ws no mesmo formato', () => {
  const a = normalizeBrasilApi(brasilApiSample);
  const b = normalizeCnpjWs(cnpjWsSample);
  for (const c of [a, b]) {
    assert.equal(c.cnpj, '11222333000181');
    assert.equal(c.situacao, 'ATIVA');
    assert.equal(c.porte, 'EPP');
    assert.equal(c.capitalSocial, 250000);
    assert.equal(c.cnaePrincipal.codigo, '6201501');
    assert.equal(c.endereco.uf, 'SC');
    assert.equal(c.telefones[0], '(48) 3333-4444');
    assert.equal(c.email, 'contato@exemplo.com.br');
    assert.equal(c.matriz, true);
    assert.equal(c.mei, false);
  }
  assert.equal(a.cnaesSecundarios.length, 1);
});

test('segmento, porte e score', () => {
  assert.equal(classifySegment('6201501').segmento, 'Tecnologia e comunicação');
  assert.equal(classifySegment('4781400').subsegmento, 'Varejo');
  assert.equal(classifySegment('0111301').segmento, 'Agronegócio');
  assert.equal(classifyPorte({ porte: 'DEMAIS', capitalSocial: 50_000_000 }).codigo, 'GRANDE');
  assert.equal(classifyPorte({ porte: 'ME', mei: true }).codigo, 'MEI');
  const c = normalizeBrasilApi(brasilApiSample);
  const intel = buildIntel(c, { targetSegments: ['Tecnologia e comunicação'] }, new Date('2026-10-21'));
  assert.ok(intel.score >= 50 && intel.score <= 100, `score ${intel.score}`);
  assert.equal(intel.ativa, true);
  assert.ok(intel.approach.length >= 2);
  const sum = intel.factors.reduce((a, f) => a + f.points, 0);
  assert.ok(Math.abs(sum - intel.score) <= 3);
  const inativa = buildIntel({ ...c, situacao: 'BAIXADA' }, {});
  assert.equal(inativa.score, 0);
  assert.equal(inativa.gradeLabel, 'Não prospectar');
});

test('criptografia, assinatura e senha', () => {
  const t = encrypt('https://x.bitrix24.com.br/rest/1/segredo/');
  assert.ok(!t.includes('segredo'));
  assert.equal(decrypt(t), 'https://x.bitrix24.com.br/rest/1/segredo/');
  const s = sign({ pid: 1 });
  assert.deepEqual(verify(s), { pid: 1 });
  assert.equal(verify(s.slice(0, -2) + 'xx'), null);
  const h = hashPassword('minhasenha123');
  assert.equal(verifyPassword('minhasenha123', h), true);
  assert.equal(verifyPassword('errada', h), false);
});

test('URL do webhook', () => {
  assert.deepEqual(parseWebhookUrl('https://Exemplo.bitrix24.com.br/rest/1/abc123/'), { url: 'https://Exemplo.bitrix24.com.br/rest/1/abc123/', domain: 'exemplo.bitrix24.com.br', userId: 1 });
  assert.equal(parseWebhookUrl('https://exemplo.bitrix24.com.br/rest/7/abc123/profile.json').url, 'https://exemplo.bitrix24.com.br/rest/7/abc123/');
  assert.equal(parseWebhookUrl('https://exemplo.bitrix24.com.br/rest/7/abc123').url, 'https://exemplo.bitrix24.com.br/rest/7/abc123/');
  assert.throws(() => parseWebhookUrl('http://exemplo.bitrix24.com.br/rest/1/abc/'));
  assert.throws(() => parseWebhookUrl('qualquer coisa'));
});

test('fontes: fallback, não encontrado e cache', async () => {
  let calls = 0;
  const fetchFallback = async (url) => {
    calls++;
    if (url.includes('brasilapi')) return jsonResponse(429, { message: 'limite' });
    return jsonResponse(200, cnpjWsSample);
  };
  const r = await fetchFromSources('11222333000181', { fetchImpl: fetchFallback });
  assert.equal(r.source, 'cnpjws');
  const notFound = async () => jsonResponse(404, { message: 'CNPJ não encontrado' });
  await assert.rejects(() => fetchFromSources('11222333000181', { fetchImpl: notFound }), (e) => e.code === 'nao_encontrado');
  const down = async () => { throw new Error('ECONNRESET'); };
  await assert.rejects(() => fetchFromSources('11222333000181', { fetchImpl: down }), (e) => e.code === 'fontes_indisponiveis');

  calls = 0;
  const ok = async () => { calls++; return jsonResponse(200, brasilApiSample); };
  const first = await lookupCnpj('11.222.333/0001-81', { fetchImpl: ok });
  const second = await lookupCnpj('11222333000181', { fetchImpl: ok });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  const stale = await lookupCnpj('11222333000181', { fetchImpl: down, force: true });
  assert.equal(stale.stale, true);
  await assert.rejects(() => lookupCnpj('123', { fetchImpl: ok }), (e) => e.code === 'cnpj_invalido');
});

test('fluxo completo com Bitrix24 simulado', async () => {
  const bx = createMockBitrix();
  const cnpjFetch = async () => jsonResponse(200, brasilApiSample);
  const portal0 = upsertPortal({ domain: 'exemplo.bitrix24.com.br', mode: 'webhook', credentials: { webhookUrl: bx.webhookUrl }, passwordHash: hashPassword('senha-forte-1') });
  const session = { pid: portal0.id, mode: 'webhook', admin: true, uname: 'Ana Teste' };
  const conn = connectionFor(portal0, session);
  assert.equal(conn.type, 'webhook');
  const client = createClient(conn, { fetchImpl: bx.fetchImpl, minIntervalMs: 0 });

  // Campos criados pelo app, sem IDs fixos; segunda execução não duplica.
  const { map, created } = await ensureFields(client, {});
  assert.equal(created.length, 12);
  assert.equal(map.cnpj, 'UF_CRM_CNPJI_CNPJ');
  const again = await ensureFields(client, map);
  assert.equal(again.created.length, 0);
  saveFieldMap(portal0.id, map);
  const portal = getPortalById(portal0.id);

  const opts = { fetchImpl: cnpjFetch, bitrixFetch: bx.fetchImpl };
  const a = await analyzeCnpj(portal, session, '11.222.333/0001-81', opts);
  assert.equal(a.crm.matches.length, 0);
  assert.equal(a.intel.segmento.segmento, 'Tecnologia e comunicação');

  const reg = await registerCompany(portal, session, '11222333000181', opts);
  assert.equal(reg.title, 'EXEMPLO DIGITAL');
  const saved = bx.state.companies.get(reg.id);
  assert.equal(saved.UF_CRM_CNPJI_CNPJ, '11.222.333/0001-81');
  assert.equal(saved.UF_CRM_CNPJI_PORTE, 'Pequeno porte');
  assert.equal(saved.ADDRESS_CITY, 'FLORIANOPOLIS');
  assert.equal(saved.PHONE[0].VALUE, '(48) 3333-4444');
  assert.equal(bx.state.comments.length, 1);

  // Duplicidade bloqueada
  await assert.rejects(() => registerCompany(portal, session, '11222333000181', opts), (e) => e.code === 'empresa_existente');
  const b = await analyzeCnpj(portal, session, '11222333000181', opts);
  assert.equal(b.crm.matches[0].id, reg.id);

  // Atualização: nada muda; depois a Receita muda o telefone e a situação
  const p1 = await enrichCompany(portal, session, reg.id, { ...opts });
  assert.equal(p1.changes.length, 0);
  const changed = { ...brasilApiSample, ddd_telefone_1: '4899998888', descricao_situacao_cadastral: 'INAPTA' };
  const p2 = await enrichCompany(portal, session, reg.id, { fetchImpl: async () => jsonResponse(200, changed), bitrixFetch: bx.fetchImpl, force: true });
  const fieldsChanged = p2.changes.map((c) => c.field);
  assert.ok(fieldsChanged.includes('Situação cadastral'));
  assert.ok(fieldsChanged.includes('Telefone (adicionar)'));
  assert.equal(bx.state.companies.get(reg.id).UF_CRM_CNPJI_SITUACAO, 'ATIVA', 'prévia não grava');
  const applied = await enrichCompany(portal, session, reg.id, { fetchImpl: async () => jsonResponse(200, changed), bitrixFetch: bx.fetchImpl, force: true, apply: true });
  assert.equal(applied.updated, true);
  const after = bx.state.companies.get(reg.id);
  assert.equal(after.UF_CRM_CNPJI_SITUACAO, 'INAPTA');
  assert.equal(after.PHONE.length, 2);
  assert.equal(after.TITLE, 'EXEMPLO DIGITAL', 'nome existente preservado');

  // Empresa sem CNPJ pede o CNPJ
  bx.state.companies.set(99, { ID: '99', TITLE: 'Cliente antigo', DATE_MODIFY: '2025-01-01' });
  const nc = await enrichCompany(portal, session, 99, opts);
  assert.equal(nc.needsCnpj, true);
  const withCnpj = await enrichCompany(portal, session, 99, { ...opts, cnpj: '11222333000181', apply: true });
  assert.equal(bx.state.companies.get(99).UF_CRM_CNPJI_CNPJ, '11.222.333/0001-81');
  assert.equal(withCnpj.updated, true);

  const list = await syncCompanies(portal, session, { force: true, bitrixFetch: bx.fetchImpl });
  assert.equal(list.companies.length, 2);
  assert.ok(list.companies.every((c) => c.status === 'atualizada'));
  const st = stats(portal);
  assert.equal(st.enriquecidas, 1);
  assert.equal(st.crm.total, 2);

  const logs = listLogs(portal.id);
  assert.ok(logs.some((l) => l.action === 'cadastro'));
  assert.ok(!JSON.stringify(logs).includes('abc123def'), 'logs não contêm o webhook');
});

test('diff não apaga dados existentes', () => {
  const c = normalizeBrasilApi(brasilApiSample);
  const intel = buildIntel(c, {});
  const map = { cnpj: 'UF_A', situacao: 'UF_B', atualizado: 'UF_Z' };
  const built = buildCompanyFields(c, intel, map, {});
  const { fields, changes } = diffForUpdate({ TITLE: 'Nome editado', ADDRESS: 'Rua X', UF_A: '11222333000181', UF_B: 'ATIVA', EMAIL: [{ VALUE: 'contato@exemplo.com.br' }] }, built, map);
  assert.equal(fields.TITLE, undefined);
  assert.equal(fields.ADDRESS, undefined);
  assert.equal(fields.EMAIL, undefined);
  assert.ok(changes.some((x) => x.field === 'Telefone (adicionar)'));
});
