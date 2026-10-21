// Teste de ponta a ponta das rotas /api, com Bitrix24 e Receita simulados.
// Uso: as rotas são empacotadas antes com esbuild (ver README, seção Testes) e o diretório é passado como argumento.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { brasilApiSample, createMockBitrix, jsonResponse } from './fixtures.js';

const dir = process.argv[2];
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cnpji-e2e-'));
process.env.APP_SECRET = 'segredo-e2e-com-mais-de-dezesseis';

const bx = createMockBitrix();
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('brasilapi.com.br')) {
    return u.endsWith('11222333000181') ? jsonResponse(200, brasilApiSample) : jsonResponse(404, { message: 'CNPJ não encontrado' });
  }
  if (u.includes('publica.cnpj.ws')) return jsonResponse(404, {});
  return bx.fetchImpl(url, init);
};

const load = async (n) => import(path.resolve(dir, `${n}.mjs`));
const R = {
  me: await load('auth_me'), login: await load('auth_login'), conn: await load('setup_connection'), fields: await load('setup_fields'),
  settings: await load('setup_settings'), cnpj: await load('cnpj__cnpj_'), companies: await load('crm_companies'),
  company: await load('crm_companies__id_'), stats: await load('stats'), logs: await load('logs'), app: await load('bitrix_app'), install: await load('bitrix_install'),
};

let cookie = '';
async function call(mod, method, url, { body, params, headers = {}, keepCookie = true, form } = {}) {
  const h = { ...headers };
  if (cookie && keepCookie) h.cookie = cookie;
  let payload;
  if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  const req = new Request(`http://localhost:3000${url}`, { method, headers: h, body: payload });
  const res = await mod[method](req, { params: Promise.resolve(params || {}) });
  const sc = res.headers.get('set-cookie');
  if (sc && keepCookie) cookie = sc.split(';')[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text, setCookie: sc };
}

const ok = (name) => console.log(`ok - ${name}`);

// 1. Sem login
let r = await call(R.me, 'GET', '/api/auth/me');
assert.equal(r.json.authenticated, false); assert.equal(r.json.hasPortals, false);
r = await call(R.cnpj, 'GET', '/api/cnpj/11222333000181', { params: { cnpj: '11222333000181' } });
assert.equal(r.status, 401); ok('rotas protegidas exigem login');

// 2. Assistente: webhook inválido, senha fraca, webhook errado, depois correto
r = await call(R.conn, 'POST', '/api/setup/connection', { body: { webhookUrl: 'abc', password: '12345678' } });
assert.equal(r.status, 400); assert.match(r.json.error.message, /formato/);
r = await call(R.conn, 'POST', '/api/setup/connection', { body: { webhookUrl: bx.webhookUrl, password: '123' } });
assert.equal(r.status, 400);
r = await call(R.conn, 'POST', '/api/setup/connection', { body: { webhookUrl: 'https://exemplo.bitrix24.com.br/rest/1/errado/', password: 'senha-forte-1' } });
assert.equal(r.status, 401); assert.match(r.json.error.message, /Webhook inválido/);
r = await call(R.conn, 'POST', '/api/setup/connection', { body: { webhookUrl: bx.webhookUrl, password: 'senha-forte-1' } });
assert.equal(r.status, 200, JSON.stringify(r.json)); assert.ok(cookie.startsWith('cnpji_sess='));
ok('conexão por webhook testada e salva');

// Webhook não aparece no banco em texto puro
const dbFile = fs.readFileSync(path.join(process.env.DATA_DIR, 'app.db'));
assert.ok(!dbFile.includes(Buffer.from('abc123def')), 'webhook criptografado no banco');
ok('webhook guardado criptografado');

// 3. Antes dos campos, a consulta pede configuração? (consulta funciona; cadastro exige campos)
r = await call(R.companies, 'POST', '/api/crm/companies', { body: { cnpj: '11222333000181' } });
assert.equal(r.status, 409); assert.equal(r.json.error.code, 'configuracao_pendente');

r = await call(R.fields, 'GET', '/api/setup/fields');
assert.equal(r.status, 200); assert.equal(r.json.fields.filter((f) => !f.exists).length, 12);
r = await call(R.fields, 'POST', '/api/setup/fields', { body: {} });
assert.equal(r.json.created, 12); assert.equal(r.json.map.cnpj, 'UF_CRM_CNPJI_CNPJ');
ok('campos criados no CRM');

r = await call(R.settings, 'POST', '/api/setup/settings', { body: { ttlDays: 30, staleDays: 90, titleFrom: 'fantasia', timelineComment: true, targetSegments: ['Tecnologia e comunicação', 'Inventado'], weights: { porte: 30, idade: 25, capital: 20, contato: 15, segmento: 10 } } });
assert.equal(r.status, 200); assert.deepEqual(r.json.settings.targetSegments, ['Tecnologia e comunicação']);
r = await call(R.settings, 'POST', '/api/setup/settings', { body: { ttlDays: 9999 } });
assert.equal(r.status, 400);
ok('preferências validadas e salvas');

// 4. Consulta, cadastro, duplicidade
r = await call(R.cnpj, 'GET', '/api/cnpj/11.222.333%2F0001-81', { params: { cnpj: '11.222.333%2F0001-81' } });
assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.intel.segmento.segmento, 'Tecnologia e comunicação'); assert.equal(r.json.crm.matches.length, 0);
r = await call(R.cnpj, 'GET', '/api/cnpj/123', { params: { cnpj: '123' } });
assert.equal(r.status, 400);
r = await call(R.cnpj, 'GET', '/api/cnpj/00000000000191', { params: { cnpj: '00000000000191' } });
assert.equal(r.status, 404); assert.match(r.json.error.message, /não encontrado/);
r = await call(R.companies, 'POST', '/api/crm/companies', { body: { cnpj: '11222333000181' } });
assert.equal(r.status, 200); const companyId = r.json.id;
r = await call(R.companies, 'POST', '/api/crm/companies', { body: { cnpj: '11222333000181' } });
assert.equal(r.status, 409); assert.equal(r.json.error.code, 'empresa_existente');
ok('consulta, cadastro e bloqueio de duplicidade');

// 5. Lista, prévia, aplicação
bx.state.companies.set(50, { ID: '50', TITLE: 'Cliente sem CNPJ', DATE_MODIFY: '2025-01-01' });
r = await call(R.companies, 'GET', '/api/crm/companies?sync=1');
assert.equal(r.json.companies.length, 2);
r = await call(R.company, 'GET', '/api/crm/companies/50', { params: { id: '50' } });
assert.equal(r.json.needsCnpj, true);
r = await call(R.company, 'GET', '/api/crm/companies/50?cnpj=11222333000181', { params: { id: '50' } });
assert.ok(r.json.changes.length > 3);
r = await call(R.company, 'POST', '/api/crm/companies/50', { params: { id: '50' }, body: { cnpj: '11222333000181' } });
assert.equal(r.json.updated, true);
r = await call(R.company, 'GET', `/api/crm/companies/${companyId}`, { params: { id: String(companyId) } });
assert.equal(r.json.changes.length, 0);
r = await call(R.company, 'GET', '/api/crm/companies/abc', { params: { id: 'abc' } });
assert.equal(r.status, 400);
ok('lista, prévia e atualização de empresas');

r = await call(R.stats, 'GET', '/api/stats');
assert.equal(r.json.enriquecidas, 1); assert.equal(r.json.crm.total, 2);
r = await call(R.logs, 'GET', '/api/logs');
assert.ok(r.json.logs.length > 5); assert.ok(!JSON.stringify(r.json).includes('abc123def'));
ok('painel e logs (sem expor o webhook)');

// 6. Login: senha errada x certa; reconfiguração exige login
const saved = cookie;
cookie = '';
r = await call(R.conn, 'POST', '/api/setup/connection', { body: { webhookUrl: bx.webhookUrl, password: 'outra-senha-9' } });
assert.equal(r.status, 403);
r = await call(R.login, 'POST', '/api/auth/login', { body: { domain: 'exemplo.bitrix24.com.br', password: 'errada' } });
assert.equal(r.status, 401);
r = await call(R.login, 'POST', '/api/auth/login', { body: { domain: 'https://exemplo.bitrix24.com.br/', password: 'senha-forte-1' } });
assert.equal(r.status, 200);
r = await call(R.me, 'GET', '/api/auth/me');
assert.equal(r.json.authenticated, true); assert.equal(r.json.portal.configured, true);
ok('login com senha e proteção da configuração');

// Sessão adulterada é recusada
r = await call(R.stats, 'GET', '/api/stats', { keepCookie: false, headers: { cookie: saved.slice(0, -3) + 'xyz' } });
assert.equal(r.status, 401);
ok('cookie adulterado é recusado');

// 7. Abrindo pelo Bitrix24 (app): token do usuário, aba da empresa e usuário sem admin
cookie = '';
r = await call(R.app, 'POST', '/api/bitrix/app?DOMAIN=exemplo.bitrix24.com.br&PROTOCOL=1&LANG=br', { form: { AUTH_ID: 'token-do-usuario', AUTH_EXPIRES: '3600', member_id: 'm1', PLACEMENT: 'CRM_COMPANY_DETAIL_TAB', PLACEMENT_OPTIONS: JSON.stringify({ ID: String(companyId) }) } });
assert.equal(r.status, 200); assert.match(r.text, new RegExp(`/empresa/${companyId}\\?aba=1`));
assert.match(r.setCookie, /SameSite=None/); assert.match(r.setCookie, /Secure/);
const token = r.text.match(/setItem\('cnpji_session',"([^"]+)"/)[1];
r = await call(R.cnpj, 'GET', '/api/cnpj/11222333000181', { params: { cnpj: '11222333000181' }, keepCookie: false, headers: { 'x-cnpji-session': token } });
assert.equal(r.status, 200); assert.equal(r.json.crm.matches[0].id, companyId);
ok('entrada pelo Bitrix24 (iframe) com token do usuário e sessão por cabeçalho');

r = await call(R.app, 'POST', '/api/bitrix/app?DOMAIN=exemplo.bitrix24.com.br', { form: {} });
assert.equal(r.status, 400); assert.match(r.text, /menu Aplicativos/);
r = await call(R.install, 'POST', '/api/bitrix/install');
assert.match(r.text, /installFinish/);
ok('instalação e erro de entrada sem token');

console.log('\nTodos os testes de rota passaram.');
