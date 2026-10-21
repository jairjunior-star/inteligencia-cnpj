// Inteligência comercial a partir dos dados públicos do CNPJ:
// segmento (pela CNAE), porte, potencial de negócio (score 0–100), alertas e sugestão de abordagem.

// Seções da CNAE 2.0 (IBGE) por divisão (2 primeiros dígitos).
const SECTIONS = [
  { secao: 'A', de: 1, ate: 3, segmento: 'Agronegócio' },
  { secao: 'B', de: 5, ate: 9, segmento: 'Indústria extrativa' },
  { secao: 'C', de: 10, ate: 33, segmento: 'Indústria' },
  { secao: 'D', de: 35, ate: 35, segmento: 'Energia' },
  { secao: 'E', de: 36, ate: 39, segmento: 'Saneamento e resíduos' },
  { secao: 'F', de: 41, ate: 43, segmento: 'Construção' },
  { secao: 'G', de: 45, ate: 47, segmento: 'Comércio' },
  { secao: 'H', de: 49, ate: 53, segmento: 'Transporte e logística' },
  { secao: 'I', de: 55, ate: 56, segmento: 'Hospedagem e alimentação' },
  { secao: 'J', de: 58, ate: 63, segmento: 'Tecnologia e comunicação' },
  { secao: 'K', de: 64, ate: 66, segmento: 'Financeiro e seguros' },
  { secao: 'L', de: 68, ate: 68, segmento: 'Imobiliário' },
  { secao: 'M', de: 69, ate: 75, segmento: 'Serviços profissionais' },
  { secao: 'N', de: 77, ate: 82, segmento: 'Serviços administrativos' },
  { secao: 'O', de: 84, ate: 84, segmento: 'Administração pública' },
  { secao: 'P', de: 85, ate: 85, segmento: 'Educação' },
  { secao: 'Q', de: 86, ate: 88, segmento: 'Saúde' },
  { secao: 'R', de: 90, ate: 93, segmento: 'Cultura, esporte e lazer' },
  { secao: 'S', de: 94, ate: 96, segmento: 'Outros serviços' },
  { secao: 'T', de: 97, ate: 97, segmento: 'Serviços domésticos' },
  { secao: 'U', de: 99, ate: 99, segmento: 'Organismos internacionais' },
];

// Subsegmentos mais úteis para o time comercial (por divisão CNAE).
const SUBSEGMENTS = {
  45: 'Veículos e autopeças', 46: 'Atacado e distribuição', 47: 'Varejo',
  49: 'Transporte terrestre', 52: 'Armazenagem e logística',
  55: 'Hotelaria', 56: 'Alimentação e restaurantes',
  58: 'Editoras', 59: 'Audiovisual', 61: 'Telecomunicações', 62: 'Software e serviços de TI', 63: 'Serviços de informação e internet',
  64: 'Serviços financeiros', 65: 'Seguros e previdência', 66: 'Serviços auxiliares financeiros',
  69: 'Contabilidade e jurídico', 70: 'Consultoria em gestão', 71: 'Engenharia e arquitetura', 72: 'Pesquisa e desenvolvimento',
  73: 'Marketing e publicidade', 74: 'Design e serviços técnicos', 75: 'Veterinária',
  77: 'Locação', 78: 'Recrutamento e mão de obra', 79: 'Turismo', 80: 'Segurança', 81: 'Facilities e limpeza', 82: 'Serviços de escritório e apoio',
  86: 'Clínicas e serviços de saúde', 87: 'Cuidados residenciais', 88: 'Assistência social',
  41: 'Construção de edifícios', 42: 'Obras de infraestrutura', 43: 'Serviços de construção',
  10: 'Alimentos', 11: 'Bebidas', 13: 'Têxtil', 14: 'Vestuário', 20: 'Química', 21: 'Farmacêutica', 22: 'Borracha e plástico',
  25: 'Produtos de metal', 26: 'Eletrônicos', 27: 'Máquinas e materiais elétricos', 28: 'Máquinas e equipamentos', 29: 'Automotiva', 31: 'Móveis',
  85: 'Educação', 68: 'Imobiliário', 93: 'Esporte e lazer', 94: 'Associações e entidades', 95: 'Reparação', 96: 'Serviços pessoais',
};

export const SEGMENT_NAMES = SECTIONS.map((s) => s.segmento);

export function classifySegment(cnae) {
  const code = String(cnae ?? '').replace(/\D/g, '').padStart(7, '0');
  const div = Number(code.slice(0, 2));
  const sec = SECTIONS.find((s) => div >= s.de && div <= s.ate);
  if (!sec || !Number(code)) return { secao: null, segmento: 'Não identificado', subsegmento: null, divisao: null };
  return { secao: sec.secao, segmento: sec.segmento, subsegmento: SUBSEGMENTS[div] ?? null, divisao: div };
}

export const PORTE_LABELS = {
  MEI: 'MEI',
  ME: 'Microempresa',
  EPP: 'Pequeno porte',
  MEDIO: 'Médio porte (estimado)',
  GRANDE: 'Grande porte (estimado)',
  DEMAIS: 'Médio/grande porte',
  NAO_INFORMADO: 'Não informado',
};

/**
 * Porte comercial. A Receita só informa ME, EPP ou "Demais"; para "Demais" estimamos médio ou grande
 * pelo capital social (sinalizado como estimativa).
 */
export function classifyPorte(company) {
  if (company.mei) return { codigo: 'MEI', label: PORTE_LABELS.MEI, estimado: false };
  const p = company.porte;
  if (p === 'ME' || p === 'EPP') return { codigo: p, label: PORTE_LABELS[p], estimado: false };
  if (p === 'DEMAIS') {
    const cap = company.capitalSocial;
    if (cap == null) return { codigo: 'DEMAIS', label: PORTE_LABELS.DEMAIS, estimado: false };
    return cap >= 10_000_000
      ? { codigo: 'GRANDE', label: PORTE_LABELS.GRANDE, estimado: true }
      : { codigo: 'MEDIO', label: PORTE_LABELS.MEDIO, estimado: true };
  }
  return { codigo: 'NAO_INFORMADO', label: PORTE_LABELS.NAO_INFORMADO, estimado: false };
}

export function companyAgeYears(abertura, ref = new Date()) {
  if (!abertura) return null;
  const d = new Date(`${abertura}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, (ref.getTime() - d.getTime()) / (365.25 * 86400000));
}

export const DEFAULT_SETTINGS = {
  ttlDays: 30,
  staleDays: 90,
  titleFrom: 'fantasia', // 'fantasia' | 'razao'
  timelineComment: true,
  targetSegments: [],
  weights: { porte: 30, idade: 25, capital: 20, contato: 15, segmento: 10 },
};

export function mergeSettings(saved) {
  const s = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  s.weights = { ...DEFAULT_SETTINGS.weights, ...((saved && saved.weights) || {}) };
  s.targetSegments = Array.isArray(s.targetSegments) ? s.targetSegments : [];
  return s;
}

const PORTE_VALUE = { MEI: 0.15, ME: 0.4, EPP: 0.65, MEDIO: 0.85, DEMAIS: 0.85, GRANDE: 1, NAO_INFORMADO: 0.35 };

function bandAge(years) {
  if (years == null) return { v: 0.4, d: 'Data de abertura não informada' };
  if (years < 1) return { v: 0.3, d: 'Menos de 1 ano de atividade' };
  if (years < 3) return { v: 0.6, d: `${Math.floor(years)} ${Math.floor(years) === 1 ? 'ano' : 'anos'} de atividade` };
  if (years < 10) return { v: 0.85, d: `${Math.floor(years)} anos de atividade` };
  return { v: 1, d: `${Math.floor(years)} anos de atividade` };
}

function bandCapital(cap) {
  if (cap == null) return { v: 0.3, d: 'Capital social não informado' };
  const fmt = brl(cap);
  if (cap < 10_000) return { v: 0.2, d: `Capital social de ${fmt}` };
  if (cap < 100_000) return { v: 0.45, d: `Capital social de ${fmt}` };
  if (cap < 1_000_000) return { v: 0.7, d: `Capital social de ${fmt}` };
  if (cap < 10_000_000) return { v: 0.9, d: `Capital social de ${fmt}` };
  return { v: 1, d: `Capital social de ${fmt}` };
}

export function brl(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n >= 1000 ? 0 : 2 });
}

const APPROACH_BY_SECTION = {
  G: 'No comércio, o ganho mais visível costuma ser centralizar o atendimento (WhatsApp, Instagram e site) em um só lugar e não perder pedidos.',
  C: 'Na indústria, o funil B2B é longo: mostre pipeline de oportunidades, propostas com aprovação e acompanhamento de representantes.',
  J: 'Empresas de tecnologia valorizam integrações e automação: destaque API, automações de funil e gestão de projetos com tarefas.',
  M: 'Em serviços profissionais, o foco é organizar clientes, contratos e projetos, com controle de horas e tarefas da equipe.',
  N: 'Em serviços administrativos, a dor costuma ser operação: chamados, SLA, ordens de serviço e comunicação com a equipe de campo.',
  Q: 'Na saúde, fale de agendamento, confirmação automática e relacionamento com pacientes, com atenção à privacidade dos dados.',
  P: 'Na educação, o funil de captação de alunos e a comunicação com responsáveis são os pontos de entrada mais fortes.',
  F: 'Na construção, gestão de obras como projetos, propostas e acompanhamento de etapas com fornecedores costuma engajar.',
  H: 'Em transporte e logística, destaque o acompanhamento de cotações, a comunicação com clientes e o controle de entregas.',
  I: 'Em hospedagem e alimentação, reservas, atendimento por WhatsApp e fidelização de clientes são o melhor começo.',
  K: 'No setor financeiro, segurança, trilha de auditoria e funis de propostas com aprovação são decisivos.',
  L: 'No imobiliário, o funil de leads por imóvel, a distribuição automática para corretores e o follow-up fazem diferença.',
  A: 'No agronegócio, a relação com distribuidores e o acompanhamento de safra e visitas de campo são bons ganchos.',
  O: 'Órgãos públicos têm processos de compra próprios: confirme o modelo de contratação antes de avançar.',
};

export function buildIntel(company, savedSettings, ref = new Date()) {
  const settings = mergeSettings(savedSettings);
  const seg = classifySegment(company.cnaePrincipal?.codigo);
  const porte = classifyPorte(company);
  const years = companyAgeYears(company.abertura, ref);
  const ativa = (company.situacao || '').toUpperCase() === 'ATIVA';
  const w = settings.weights;

  const age = bandAge(years);
  const cap = bandCapital(company.capitalSocial);
  const hasEmail = Boolean(company.email);
  const hasPhone = (company.telefones || []).length > 0;
  const contactV = hasEmail && hasPhone ? 1 : hasEmail || hasPhone ? 0.6 : 0;
  const targets = settings.targetSegments;
  let segV;
  let segD;
  if (!targets.length) {
    segV = 0.5;
    segD = 'Nenhum segmento-alvo definido na configuração';
  } else if (targets.includes(seg.segmento)) {
    segV = 1;
    segD = `${seg.segmento} é um segmento-alvo`;
  } else {
    segV = 0.2;
    segD = `${seg.segmento} não está nos segmentos-alvo`;
  }

  const factors = [
    { key: 'porte', label: 'Porte', weight: Number(w.porte) || 0, value: PORTE_VALUE[porte.codigo] ?? 0.35, detail: porte.label },
    { key: 'idade', label: 'Tempo de atividade', weight: Number(w.idade) || 0, value: age.v, detail: age.d },
    { key: 'capital', label: 'Capital social', weight: Number(w.capital) || 0, value: cap.v, detail: cap.d },
    {
      key: 'contato',
      label: 'Contato disponível',
      weight: Number(w.contato) || 0,
      value: contactV,
      detail: hasEmail && hasPhone ? 'E-mail e telefone' : hasEmail ? 'Só e-mail' : hasPhone ? 'Só telefone' : 'Sem contato público',
    },
    { key: 'segmento', label: 'Aderência ao segmento-alvo', weight: Number(w.segmento) || 0, value: segV, detail: segD },
  ];
  const totalW = factors.reduce((a, f) => a + f.weight, 0) || 1;
  for (const f of factors) f.points = Math.round((f.weight * f.value * 100) / totalW);
  let score = Math.round(factors.reduce((a, f) => a + f.weight * f.value, 0) * (100 / totalW));
  if (!ativa) score = 0;
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 75 ? 'A' : score >= 50 ? 'B' : 'C';
  const gradeLabel = !ativa ? 'Não prospectar' : grade === 'A' ? 'Alta prioridade' : grade === 'B' ? 'Média prioridade' : 'Baixa prioridade';

  const alerts = [];
  if (!ativa) {
    alerts.push({
      level: 'erro',
      text: `Situação cadastral: ${company.situacao || 'não informada'}${company.motivoSituacao ? ` (${company.motivoSituacao})` : ''}. Não é recomendado prospectar.`,
    });
  }
  if (company.matriz === false) alerts.push({ level: 'aviso', text: 'Este CNPJ é de uma filial. Verifique se a matriz já está no CRM.' });
  if (porte.codigo === 'MEI') alerts.push({ level: 'aviso', text: 'Microempreendedor individual: o ticket tende a ser baixo e a decisão é do próprio dono.' });
  if (!hasEmail && !hasPhone) alerts.push({ level: 'aviso', text: 'Sem e-mail ou telefone público. Busque o contato por outros canais.' });
  if (years != null && years < 1) alerts.push({ level: 'info', text: 'Empresa aberta há menos de 1 ano: bom momento para estruturar processos desde o início.' });
  if (porte.estimado) alerts.push({ level: 'info', text: 'O porte médio/grande é uma estimativa pelo capital social (a Receita informa apenas "Demais").' });

  const approach = [];
  if (ativa) {
    const sectionTip = APPROACH_BY_SECTION[seg.secao];
    if (sectionTip) approach.push(sectionTip);
    if (porte.codigo === 'MEI' || porte.codigo === 'ME') {
      approach.push('Empresa pequena: comece por um plano enxuto e uma implantação rápida, com resultado visível nas primeiras semanas.');
    } else if (porte.codigo === 'EPP') {
      approach.push('Pequeno porte em crescimento: mostre como padronizar vendas e atendimento antes de contratar mais pessoas.');
    } else if (['MEDIO', 'GRANDE', 'DEMAIS'].includes(porte.codigo)) {
      approach.push('Empresa maior: envolva gestores de mais de uma área e proponha um diagnóstico de processos antes da proposta.');
    }
    const socios = (company.socios || []).filter((s) => s.nome);
    if (socios.length) {
      const nomes = socios.slice(0, 2).map((s) => s.nome).join(' e ');
      approach.push(`Decisores prováveis no quadro societário: ${nomes}${socios.length > 2 ? ` e mais ${socios.length - 2}` : ''}.`);
    }
    if (hasPhone) approach.push(`Primeiro contato sugerido: telefone ${company.telefones[0]}${hasEmail ? ` ou e-mail ${company.email}` : ''}.`);
    else if (hasEmail) approach.push(`Primeiro contato sugerido: e-mail ${company.email}.`);
  }

  return {
    segmento: seg,
    porte,
    idadeAnos: years == null ? null : Math.floor(years),
    ativa,
    score,
    grade: ativa ? grade : 'C',
    gradeLabel,
    factors,
    alerts,
    approach,
  };
}
