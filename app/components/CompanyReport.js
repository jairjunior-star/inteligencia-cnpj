'use client';

import { Alert, SituacaoBadge, GradeBadge } from './ui';
import { formatDate, formatMoney } from '@/lib/client';

function cnae(code) {
  const c = String(code || '').padStart(7, '0');
  return code ? `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}` : '';
}

function address(e) {
  if (!e) return '—';
  const rua = [e.tipoLogradouro, e.logradouro].filter(Boolean).join(' ');
  const l1 = [rua, e.numero, e.complemento].filter(Boolean).join(', ');
  const cep = e.cep && e.cep.length === 8 ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : e.cep;
  return [l1, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), cep ? `CEP ${cep}` : null].filter(Boolean).join(' · ') || '—';
}

const gradeColor = { A: 'var(--grade-a)', B: 'var(--grade-b)', C: 'var(--grade-c)' };

export default function CompanyReport({ result, actions }) {
  const { data, intel, source, cnpjFormatado } = result;
  const totalWeight = intel.factors.reduce((a, f) => a + f.weight, 0) || 1;

  return (
    <div className="stack">
      <section className="card">
        <div className="report-head">
          <div className="report-title">
            <div className="row">
              <SituacaoBadge situacao={data.situacao} />
              {data.matriz === false && <span className="badge badge-warn">Filial</span>}
              {data.matriz === true && <span className="badge badge-muted">Matriz</span>}
              {data.mei && <span className="badge badge-muted">MEI</span>}
              {data.simples && !data.mei && <span className="badge badge-muted">Simples Nacional</span>}
            </div>
            <h2 style={{ fontSize: 22 }}>{data.nomeFantasia || data.razaoSocial}</h2>
            <p className="sub">
              {data.nomeFantasia ? `${data.razaoSocial} · ` : ''}CNPJ <span className="num">{cnpjFormatado}</span>
            </p>
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Fonte: {data.fonte} · {source.cached ? 'cache local' : 'consulta agora'} em {formatDate(source.fetchedAt, true)}
          {source.stale ? ' · as bases públicas estão indisponíveis; mostrando a última consulta salva' : ''}
        </p>
      </section>

      <div className="grid grid-2">
        <section className="card stack">
          <h2>Inteligência comercial</h2>
          <div className="score">
            <div className="score-ring" style={{ '--v': intel.score, '--c': intel.ativa ? gradeColor[intel.grade] : 'var(--bad)' }}>
              <span>{intel.score}</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <div className="grade"><GradeBadge grade={intel.ativa ? intel.grade : null} label={intel.gradeLabel} /></div>
              <p className="small">Score de potencial de 0 a 100, calculado com os critérios e pesos da configuração.</p>
            </div>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {intel.factors.map((f) => (
              <div className="factor" key={f.key}>
                <span>{f.label} <span className="muted">(peso {Math.round((f.weight / totalWeight) * 100)}%)</span></span>
                <span className="num"><strong>{Math.round(f.value * 100)}</strong>/100</span>
                <div className="bar"><span style={{ width: `${Math.round(f.value * 100)}%` }} /></div>
                <span className="detail">{f.detail}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card stack">
          <h2>Segmento e porte</h2>
          <dl className="kv">
            <div><dt>Segmento</dt><dd>{intel.segmento.segmento}</dd></div>
            <div><dt>Subsegmento</dt><dd>{intel.segmento.subsegmento || '—'}</dd></div>
            <div><dt>Porte</dt><dd>{intel.porte.label}</dd></div>
            <div><dt>Tempo de atividade</dt><dd>{intel.idadeAnos == null ? '—' : intel.idadeAnos === 0 ? 'Menos de 1 ano' : `${intel.idadeAnos} ${intel.idadeAnos === 1 ? 'ano' : 'anos'}`}</dd></div>
            <div><dt>Capital social</dt><dd className="num">{formatMoney(data.capitalSocial)}</dd></div>
            <div><dt>Natureza jurídica</dt><dd>{data.naturezaJuridica || '—'}</dd></div>
          </dl>
          {intel.alerts.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              {intel.alerts.map((a, i) => <Alert key={i} level={a.level}>{a.text}</Alert>)}
            </div>
          )}
          {intel.approach.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <h3>Sugestão de abordagem</h3>
              <ul className="clean">{intel.approach.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </section>
      </div>

      <section className="card stack">
        <h2>Dados cadastrais</h2>
        <dl className="kv">
          <div><dt>Data de abertura</dt><dd>{formatDate(data.abertura)}</dd></div>
          <div><dt>Situação desde</dt><dd>{formatDate(data.situacaoData)}{data.motivoSituacao && data.situacao !== 'ATIVA' ? ` · ${data.motivoSituacao}` : ''}</dd></div>
          <div><dt>Atividade principal (CNAE)</dt><dd>{data.cnaePrincipal ? `${cnae(data.cnaePrincipal.codigo)} · ${data.cnaePrincipal.descricao || ''}` : '—'}</dd></div>
          <div><dt>Endereço</dt><dd>{address(data.endereco)}</dd></div>
          <div><dt>Telefone</dt><dd>{data.telefones?.length ? data.telefones.join(' · ') : '—'}</dd></div>
          <div><dt>E-mail</dt><dd>{data.email || '—'}</dd></div>
        </dl>
        {data.cnaesSecundarios?.length > 0 && (
          <details>
            <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Atividades secundárias ({data.cnaesSecundarios.length})</summary>
            <ul className="clean small" style={{ marginTop: 8 }}>
              {data.cnaesSecundarios.map((c, i) => <li key={i}>{cnae(c.codigo)} · {c.descricao}</li>)}
            </ul>
          </details>
        )}
        {data.socios?.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <h3>Quadro societário</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nome</th><th>Qualificação</th><th>Desde</th></tr></thead>
                <tbody>
                  {data.socios.map((s, i) => (
                    <tr key={i}><td>{s.nome}</td><td>{s.qualificacao || '—'}</td><td className="num">{formatDate(s.desde)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
