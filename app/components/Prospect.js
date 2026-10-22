'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, formatMoney, formatDate } from '@/lib/client';
import { Alert, Spinner, GradeBadge, Icon } from './ui';

const SCORE_OPTIONS = [
  { v: '', l: 'Qualquer score' },
  { v: '50', l: '50 ou mais' },
  { v: '75', l: '75 ou mais (A)' },
];

function cnaeFmt(c) {
  const s = String(c || '').padStart(7, '0');
  return c ? `${s.slice(0, 4)}-${s.slice(4, 5)}/${s.slice(5)}` : '';
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Gera e baixa um CSV (separado por ponto e vírgula, com BOM, abre direto no Excel em português). */
export function exportCsv(rows, filename) {
  const cols = [
    ['CNPJ', (r) => r.cnpjFormatado],
    ['Nome', (r) => r.title],
    ['Razão social', (r) => r.razao],
    ['Situação', (r) => r.situacao],
    ['CNAE', (r) => (r.cnae ? cnaeFmt(r.cnae) : '')],
    ['Atividade', (r) => r.cnaeDesc],
    ['Segmento', (r) => r.segment],
    ['Subsegmento', (r) => r.subsegment],
    ['Porte', (r) => r.porte],
    ['Capital social', (r) => (r.capital == null ? '' : String(r.capital).replace('.', ','))],
    ['Abertura', (r) => (r.abertura ? formatDate(r.abertura) : '')],
    ['Cidade', (r) => r.city],
    ['UF', (r) => r.uf],
    ['Telefone', (r) => r.phone],
    ['E-mail', (r) => r.email],
    ['Score', (r) => (r.score == null ? '' : r.score)],
    ['Prioridade', (r) => r.grade],
    ['No CRM', (r) => (r.companyId ? `Sim (#${r.companyId})` : 'Não')],
  ];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => c[0]).join(';'), ...rows.map((r) => cols.map((c) => esc(c[1](r))).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ImportPanel({ rows, listId, onClose, onDone }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [categoryId, setCategoryId] = useState('');
  const [stageId, setStageId] = useState('');
  const [assignedById, setAssignedById] = useState('');
  const [createDeal, setCreateDeal] = useState(true);
  const [dealForExisting, setDealForExisting] = useState(false);
  const [run, setRun] = useState(null);

  useEffect(() => {
    api('/api/crm/funis')
      .then((m) => {
        setMeta(m);
        const def = m.pipelines.find((p) => p.isDefault) || m.pipelines[0];
        if (def) {
          setCategoryId(String(def.id));
          setStageId(def.stages[0]?.id || '');
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const pipeline = meta?.pipelines.find((p) => String(p.id) === String(categoryId));

  async function start() {
    const cnpjs = rows.map((r) => r.cnpj);
    const state = { total: cnpjs.length, done: 0, importado: 0, ja_no_crm: 0, inativa: 0, deals: 0, erros: [] };
    setRun({ ...state, running: true });
    for (let i = 0; i < cnpjs.length; i += 3) {
      const chunk = cnpjs.slice(i, i + 3);
      try {
        const r = await api('/api/prospeccao/importar', {
          method: 'POST',
          body: { cnpjs: chunk, categoryId, stageId, assignedById: assignedById || null, createDeal, dealForExisting, listId: listId || null },
        });
        for (const x of r.results) {
          if (x.status === 'erro') state.erros.push(x);
          else state[x.status] = (state[x.status] || 0) + 1;
          if (x.dealId) state.deals++;
        }
      } catch (err) {
        for (const c of chunk) state.erros.push({ cnpjFormatado: c, message: err.message });
      }
      state.done = Math.min(cnpjs.length, i + chunk.length);
      setRun({ ...state, running: true });
    }
    setRun({ ...state, running: false });
    onDone?.();
  }

  return (
    <section className="card stack import-panel">
      <div className="section-title">
        <span className="section-icon"><Icon name="database" size={16} /></span>
        <h2>Importar {rows.length} {rows.length === 1 ? 'empresa' : 'empresas'} para o Bitrix24</h2>
        <span className="spacer" />
        {!run?.running && <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Fechar</button>}
      </div>
      {error && <Alert level="erro">{error}</Alert>}
      {!meta && !error && <div className="empty"><Spinner /> Lendo funis e usuários do Bitrix24…</div>}
      {meta && !run && (
        <>
          <div className="grid grid-3">
            <label className="field" htmlFor="imp-funil">
              Funil do negócio
              <select id="imp-funil" value={categoryId} disabled={!createDeal} onChange={(e) => { setCategoryId(e.target.value); const p = meta.pipelines.find((x) => String(x.id) === e.target.value); setStageId(p?.stages[0]?.id || ''); }}>
                {meta.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="imp-etapa">
              Etapa inicial
              <select id="imp-etapa" value={stageId} disabled={!createDeal} onChange={(e) => setStageId(e.target.value)}>
                {(pipeline?.stages || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                {!pipeline?.stages?.length && <option value="">Primeira etapa do funil</option>}
              </select>
            </label>
            <label className="field" htmlFor="imp-resp">
              Responsável
              <select id="imp-resp" value={assignedById} onChange={(e) => setAssignedById(e.target.value)}>
                <option value="">Padrão do Bitrix24</option>
                {meta.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
          <label className="checkbox" htmlFor="imp-deal">
            <input id="imp-deal" type="checkbox" checked={createDeal} onChange={(e) => setCreateDeal(e.target.checked)} />
            Criar um negócio de prospecção para cada empresa
          </label>
          <label className="checkbox" htmlFor="imp-existing">
            <input id="imp-existing" type="checkbox" checked={dealForExisting} disabled={!createDeal} onChange={(e) => setDealForExisting(e.target.checked)} />
            Para empresas que já estão no CRM, criar só o negócio (sem duplicar a empresa)
          </label>
          <p className="small muted">Empresas inativas na Receita são puladas. As de prioridade A ganham follow-up automático, se estiver ligado na configuração.</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={start}>Importar agora</button>
          </div>
        </>
      )}
      {run && (
        <div className="stack">
          <div className="row">
            <strong>{run.running ? 'Importando…' : 'Importação concluída'}</strong>
            <span className="spacer" />
            <span className="num small">{run.done} de {run.total}</span>
          </div>
          <div className="progress"><span style={{ width: `${Math.round((run.done / run.total) * 100)}%` }} /></div>
          <div className="grid grid-4">
            <div className="mini-kpi"><span className="v">{run.importado}</span><span className="l">empresas criadas</span></div>
            <div className="mini-kpi"><span className="v">{run.deals}</span><span className="l">negócios criados</span></div>
            <div className="mini-kpi"><span className="v">{run.ja_no_crm}</span><span className="l">já estavam no CRM</span></div>
            <div className="mini-kpi"><span className="v">{run.inativa}</span><span className="l">inativas puladas</span></div>
          </div>
          {run.erros.length > 0 && (
            <Alert level="erro">
              <span>{run.erros.length} com erro: {run.erros.slice(0, 5).map((e) => `${e.cnpjFormatado} (${e.message})`).join('; ')}{run.erros.length > 5 ? '…' : ''}</span>
            </Alert>
          )}
          {!run.running && <div className="row"><button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button></div>}
        </div>
      )}
    </section>
  );
}

const STATUS_LABEL = { pendente: 'Analisando…', nao_encontrado: 'Não encontrado', erro: 'Erro' };

/** Filtros + tabela + seleção + importação + exportação. */
export default function ProspectExplorer({ rows, listId, exportName = 'prospeccao', onReload }) {
  const [f, setF] = useState({ q: '', cnae: '', segment: '', porte: '', uf: '', city: '', minScore: '', ativas: true, foraDoCrm: false });
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const options = useMemo(() => {
    const uniq = (k) => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    return { segments: uniq('segment'), portes: uniq('porte'), ufs: uniq('uf') };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = norm(f.q);
    const qd = f.q.replace(/\D/g, '');
    const cn = f.cnae.replace(/\D/g, '');
    const cnText = norm(f.cnae);
    return rows.filter((r) => {
      if (q && !(norm(r.title).includes(q) || norm(r.razao).includes(q) || (qd.length >= 4 && r.cnpj.includes(qd)))) return false;
      if (f.cnae) {
        if (cn.length >= 2 ? !String(r.cnae || '').startsWith(cn) : !norm(r.cnaeDesc).includes(cnText)) return false;
      }
      if (f.segment && r.segment !== f.segment) return false;
      if (f.porte && r.porte !== f.porte) return false;
      if (f.uf && r.uf !== f.uf) return false;
      if (f.city && !norm(r.city).includes(norm(f.city))) return false;
      if (f.minScore && !(r.score >= Number(f.minScore))) return false;
      if (f.ativas && r.situacao && r.situacao !== 'ATIVA') return false;
      if (f.foraDoCrm && r.companyId) return false;
      return true;
    });
  }, [rows, f]);

  const selectable = filtered.filter((r) => r.situacao === 'ATIVA');
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.cnpj));
  const toggle = (c) => setSelected((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const selectedRows = rows.filter((r) => selected.has(r.cnpj));
  const enriched = filtered.filter((r) => r.situacao);

  return (
    <div className="stack">
      <section className="card stack">
        <div className="filters">
          <label className="field" htmlFor="f-q">Nome ou CNPJ<input id="f-q" type="search" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Buscar" /></label>
          <label className="field" htmlFor="f-cnae">CNAE<input id="f-cnae" type="search" value={f.cnae} onChange={(e) => set('cnae', e.target.value)} placeholder="Ex.: 4711 ou supermercado" /></label>
          <label className="field" htmlFor="f-seg">Segmento
            <select id="f-seg" value={f.segment} onChange={(e) => set('segment', e.target.value)}>
              <option value="">Todos</option>{options.segments.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field" htmlFor="f-porte">Porte
            <select id="f-porte" value={f.porte} onChange={(e) => set('porte', e.target.value)}>
              <option value="">Todos</option>{options.portes.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field" htmlFor="f-uf">UF
            <select id="f-uf" value={f.uf} onChange={(e) => set('uf', e.target.value)}>
              <option value="">Todas</option>{options.ufs.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field" htmlFor="f-city">Cidade<input id="f-city" type="search" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Ex.: Campinas" /></label>
          <label className="field" htmlFor="f-score">Score
            <select id="f-score" value={f.minScore} onChange={(e) => set('minScore', e.target.value)}>
              {SCORE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="checkbox" htmlFor="f-ativas"><input id="f-ativas" type="checkbox" checked={f.ativas} onChange={(e) => set('ativas', e.target.checked)} />Só empresas ativas</label>
          <label className="checkbox" htmlFor="f-fora"><input id="f-fora" type="checkbox" checked={f.foraDoCrm} onChange={(e) => set('foraDoCrm', e.target.checked)} />Só as que ainda não estão no CRM</label>
        </div>
      </section>

      <div className="action-bar">
        <span className="small"><strong>{filtered.length}</strong> empresas no filtro · <strong>{selected.size}</strong> selecionadas</span>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!enriched.length} onClick={() => exportCsv(selectedRows.length ? selectedRows : enriched, `${exportName}.csv`)}>
          <Icon name="file" size={15} /> Exportar CSV {selectedRows.length ? `(${selectedRows.length})` : '(filtro)'}
        </button>
        <button type="button" className="btn btn-primary" disabled={!selected.size} onClick={() => setImporting(true)}>
          <Icon name="database" size={16} /> Importar para o Bitrix24
        </button>
      </div>

      {importing && (
        <ImportPanel
          rows={selectedRows}
          listId={listId}
          onClose={() => { setImporting(false); setSelected(new Set()); }}
          onDone={() => onReload?.()}
        />
      )}

      {filtered.length === 0 ? (
        <section className="card empty">Nenhuma empresa neste filtro.</section>
      ) : (
        <div className="table-wrap card-table">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Selecionar todas as ativas do filtro" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.cnpj)))} /></th>
                <th>Empresa</th>
                <th>Atividade</th>
                <th>Porte</th>
                <th>Local</th>
                <th>Score</th>
                <th>CRM</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r) => (
                <tr key={r.cnpj}>
                  <td><input type="checkbox" aria-label={`Selecionar ${r.title || r.cnpjFormatado}`} disabled={r.situacao !== 'ATIVA'} checked={selected.has(r.cnpj)} onChange={() => toggle(r.cnpj)} /></td>
                  <td>
                    <strong>{r.title || r.cnpjFormatado}</strong>
                    <div className="small muted num">{r.cnpjFormatado}{r.situacao && r.situacao !== 'ATIVA' ? ` · ${r.situacao}` : ''}</div>
                    {r.status && STATUS_LABEL[r.status] && <span className={`badge ${r.status === 'pendente' ? 'badge-info' : 'badge-warn'}`} title={r.error || ''}>{STATUS_LABEL[r.status]}</span>}
                  </td>
                  <td className="small">{r.cnae ? <><span className="num">{cnaeFmt(r.cnae)}</span> · {r.cnaeDesc}</> : '—'}{r.segment ? <div className="muted">{r.segment}{r.subsegment ? ` / ${r.subsegment}` : ''}</div> : null}</td>
                  <td className="small">{r.porte || '—'}{r.capital != null ? <div className="muted num">{formatMoney(r.capital)}</div> : null}</td>
                  <td className="small">{[r.city, r.uf].filter(Boolean).join('/') || '—'}</td>
                  <td>{r.score != null ? <GradeBadge grade={r.situacao === 'ATIVA' ? r.grade : null} label={String(r.score)} /> : '—'}</td>
                  <td className="small">
                    {r.companyId ? <Link href={`/empresa/${r.companyId}`}>No CRM{r.dealId ? ' · negócio criado' : ''}</Link> : <span className="muted">Fora do CRM</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && <p className="small muted" style={{ padding: 12 }}>Mostrando 500 de {filtered.length}. Use os filtros para refinar; a exportação inclui todas.</p>}
        </div>
      )}
    </div>
  );
}
