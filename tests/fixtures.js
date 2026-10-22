// Respostas de exemplo (dados fictícios) no formato das APIs públicas.
export const brasilApiSample = {
  cnpj: '11222333000181',
  identificador_matriz_filial: 1,
  descricao_identificador_matriz_filial: 'MATRIZ',
  razao_social: 'EXEMPLO SOLUCOES DIGITAIS LTDA',
  nome_fantasia: 'EXEMPLO DIGITAL',
  situacao_cadastral: 2,
  descricao_situacao_cadastral: 'ATIVA',
  data_situacao_cadastral: '2015-03-10',
  motivo_situacao_cadastral: 0,
  descricao_motivo_situacao_cadastral: 'SEM MOTIVO',
  codigo_natureza_juridica: 2062,
  natureza_juridica: 'Sociedade Empresária Limitada',
  data_inicio_atividade: '2015-03-10',
  cnae_fiscal: 6201501,
  cnae_fiscal_descricao: 'Desenvolvimento de programas de computador sob encomenda',
  descricao_tipo_de_logradouro: 'RUA',
  logradouro: 'DAS FLORES',
  numero: '100',
  complemento: 'SALA 2',
  bairro: 'CENTRO',
  cep: '88010000',
  uf: 'SC',
  codigo_municipio: 8105,
  municipio: 'FLORIANOPOLIS',
  ddd_telefone_1: '4833334444',
  ddd_telefone_2: '',
  ddd_fax: '',
  email: 'CONTATO@EXEMPLO.COM.BR',
  capital_social: 250000,
  codigo_porte: 3,
  porte: 'EMPRESA DE PEQUENO PORTE',
  opcao_pelo_simples: true,
  opcao_pelo_mei: false,
  cnaes_secundarios: [{ codigo: 6204000, descricao: 'Consultoria em tecnologia da informação' }, { codigo: 0, descricao: '' }],
  qsa: [
    { nome_socio: 'MARIA EXEMPLO', qualificacao_socio: 'Sócio-Administrador', data_entrada_sociedade: '2015-03-10' },
    { nome_socio: 'JOAO EXEMPLO', qualificacao_socio: 'Sócio', data_entrada_sociedade: '2018-01-02' },
  ],
};

export const cnpjWsSample = {
  razao_social: 'EXEMPLO SOLUCOES DIGITAIS LTDA',
  capital_social: '250000.00',
  porte: { id: '03', descricao: 'Empresa de Pequeno Porte' },
  natureza_juridica: { id: '2062', descricao: 'Sociedade Empresária Limitada' },
  simples: { simples: 'Sim', mei: 'Não' },
  socios: [{ nome: 'MARIA EXEMPLO', qualificacao_socio: { descricao: 'Sócio-Administrador' }, data_entrada: '2015-03-10' }],
  estabelecimento: {
    cnpj: '11222333000181',
    tipo: 'Matriz',
    nome_fantasia: 'EXEMPLO DIGITAL',
    situacao_cadastral: 'Ativa',
    data_situacao_cadastral: '2015-03-10',
    data_inicio_atividade: '2015-03-10',
    tipo_logradouro: 'Rua',
    logradouro: 'das Flores',
    numero: '100',
    complemento: 'Sala 2',
    bairro: 'Centro',
    cep: '88010000',
    ddd1: '48',
    telefone1: '33334444',
    email: 'contato@exemplo.com.br',
    atividade_principal: { id: '6201501', subclasse: '6201-5/01', descricao: 'Desenvolvimento de programas de computador sob encomenda' },
    atividades_secundarias: [{ id: '6204000', descricao: 'Consultoria em tecnologia da informação' }],
    cidade: { nome: 'Florianópolis' },
    estado: { sigla: 'SC' },
  },
};

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Bitrix24 simulado em memória: implementa os métodos REST que o app usa. */
export function createMockBitrix({ webhookUrl = 'https://exemplo.bitrix24.com.br/rest/1/abc123def/' } = {}) {
  const state = { userfields: [], companies: new Map(), nextId: 1, comments: [], calls: [], todos: [], tasks: [], noTodo: false };
  const handlers = {
    profile: () => ({ ID: '1', NAME: 'Ana', LAST_NAME: 'Teste', ADMIN: true }),
    'user.admin': () => true,
    'crm.company.fields': () => ({ ID: {}, TITLE: {} }),
    'crm.company.userfield.list': () => state.userfields,
    'crm.company.userfield.add': (p) => {
      const f = { ID: String(state.userfields.length + 1), FIELD_NAME: `UF_CRM_${p.fields.FIELD_NAME}`, XML_ID: p.fields.XML_ID, USER_TYPE_ID: p.fields.USER_TYPE_ID, EDIT_FORM_LABEL: { br: p.fields.EDIT_FORM_LABEL } };
      state.userfields.push(f);
      return Number(f.ID);
    },
    'crm.company.list': (p) => {
      let rows = [...state.companies.values()];
      for (const [k, v] of Object.entries(p.filter || {})) rows = rows.filter((r) => String(r[k] ?? '') === String(v));
      const start = Number(p.start || 0);
      const page = rows.slice(start, start + 50);
      return { result: page, next: start + 50 < rows.length ? start + 50 : undefined, total: rows.length };
    },
    'crm.company.add': (p) => {
      const id = state.nextId++;
      state.companies.set(id, { ID: String(id), DATE_MODIFY: new Date().toISOString(), ASSIGNED_BY_ID: '1', ...p.fields });
      return id;
    },
    'crm.company.get': (p) => state.companies.get(Number(p.id)) || null,
    'crm.company.update': (p) => {
      const c = state.companies.get(Number(p.id));
      if (!c) return { error: 'NOT_FOUND', error_description: 'Not found' };
      for (const [k, v] of Object.entries(p.fields)) {
        if (k === 'PHONE' || k === 'EMAIL') c[k] = [...(c[k] || []), ...v];
        else c[k] = v;
      }
      return true;
    },
    'crm.timeline.comment.add': (p) => {
      state.comments.push(p.fields);
      return state.comments.length;
    },
    'placement.bind': () => true,
    'crm.activity.todo.add': (p) => {
      if (state.noTodo) return { error: 'ERROR_METHOD_NOT_FOUND', error_description: 'Method not found' };
      state.todos.push(p);
      return { id: state.todos.length };
    },
    'tasks.task.add': (p) => {
      state.tasks.push(p.fields);
      return { task: { id: state.tasks.length } };
    },
  };
  async function fetchImpl(url, init) {
    const u = String(url);
    const method = u.replace(/^.*\/rest\/(?:\d+\/[A-Za-z0-9]+\/)?/, '').replace(/\.json$/, '');
    if (!u.startsWith(webhookUrl) && !u.includes('/rest/')) return jsonResponse(404, {});
    if (u.startsWith('https://exemplo.bitrix24.com.br/rest/') && !u.startsWith(webhookUrl) && !/\/rest\/[a-z]/.test(u)) {
      return jsonResponse(401, { error: 'NO_AUTH_FOUND', error_description: 'Wrong authorization data' });
    }
    const params = init?.body ? JSON.parse(init.body) : {};
    state.calls.push(method);
    const h = handlers[method];
    if (!h) return jsonResponse(400, { error: 'ERROR_METHOD_NOT_FOUND', error_description: 'Method not found' });
    const out = h(params);
    if (out && out.error) return jsonResponse(400, out);
    if (out && Object.prototype.hasOwnProperty.call(out, 'result') && method === 'crm.company.list') return jsonResponse(200, out);
    return jsonResponse(200, { result: out });
  }
  return { state, fetchImpl, webhookUrl };
}
