'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, formatDate } from '@/lib/client';
import { Alert, Spinner, GradeBadge } from '../components/ui';

const STATUS = {
  sem_cnpj: { label: 'Sem CNPJ', cls: 'badge-muted' },
  nunca: { label: 'Nunca atualizada', cls: 'badge-warn' },
  desatualizada: { label: 'Desatualizada', cls: 'badge-warn' },
  atualizada: { label: 'Atualizada', cls: 'badge-ok' },
};

const FILTERS = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendentes', label: 'Precisam de atualização' },
  { id: 'sem_cnpj', label: 'Sem CNPJ' },
  { id: 'atualizada', label: 'Atualizadas' },
];

export default function EmpresasPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pendentes');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [batch, setBatch] = useState(null);

  async function load(sync = false) {
    setLoading(true);
    setError(null);
    try {
      setData(await api(`/api/crm/companies${sync ? '?sync=1' : ''}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false); }, []);

  const list = useMemo(() => {
    const rows = data?.companies || [];
    const term = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (filter === 'pendentes' && !(c.status === 'nunca' || c.status === 'desatualizada')) return false;
      if (filter === 'sem_cnpj' && c.status !== 'sem_cnpj') return false;
      if (filter === 'atualizada' && c.status !== 'atualizada') return false;
      if (!term) return true;
      return (c.title || '').toLowerCase().includes(term) || (c.cnpj || '').includes(term.replace(/\D/g, '') || '§');
    });
  }, [data, filter, q]);

  const selectable = list.filter((c) => c.cnpj);
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id));

  function toggle(id) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((c) => c.id)));
  }

  // Atualização em lote: uma empresa por vez, respeitando o limite de requisições do Bitrix24.
  async function updateSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const state = { total: ids.length, done: 0, updated: 0, same: 0, failed: [] };
    setBatch({ ...state, running: true });
    for (const id of ids) {
      try {
        const r = await api(`/api/crm/companies/${id}`, { method: 'POST', body: {} });
        if (r.updated) state.updated++;
        else state.same++;
      } catch (err) {
        const c = data.companies.find((x) => x.id === id);
        state.failed.push({ id, title: c?.title, message: err.message });
      }
      state.done++;
      setBatch({ ...state, running: true });
    }
    setBatch({ ...state, running: false });
    setSelected(new Set());
    await load(false);
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Empresas do CRM</h1>
          <p>Veja quais empresas estão sem CNPJ ou com dados antigos e atualize várias de uma vez com as informações da Receita Federal.</p>
        </div>
        <div className="row">
          <span className="small muted">{data?.syncedAt ? `Sincronizado em ${formatDate(data.syncedAt, true)}` : ''}</span>
          <button type="button" className="btn btn-secondary" onClick={() => load(true)} disabled={loading}>
            {loading ? <Spinner /> : null}Sincronizar com o Bitrix24
          </button>
        </div>
      </div>

      {error && <Alert level="erro">{error}</Alert>}

      {batch && (
        <section className="card stack">
          <div className="row">
            <strong>{batch.running ? 'Atualizando empresas…' : 'Atualização concluída'}</strong>
            <span className="spacer" />
            <span className="num small">{batch.done} de {batch.total}</span>
          </div>
          <div className="progress"><span style={{ width: `${Math.round((batch.done / batch.total) * 100)}%` }} /></div>
          {!batch.running && (
            <p className="small">{batch.updated} atualizadas · {batch.same} já estavam em dia · {batch.failed.length} com erro</p>
          )}
          {batch.failed.length > 0 && (
            <ul className="clean small">{batch.failed.map((f) => <li key={f.id}><strong>{f.title || `#${f.id}`}</strong>: {f.message}</li>)}</ul>
          )}
        </section>
      )}

      <section className="card stack">
        <div className="row">
          <div className="row" role="group" aria-label="Filtro">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <span className="spacer" />
          <input type="search" id="busca" aria-label="Buscar por nome ou CNPJ" placeholder="Buscar por nome ou CNPJ" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        </div>
        <div className="row">
          <span className="small muted">{list.length} empresas · {selected.size} selecionadas</span>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!selected.size || batch?.running} onClick={updateSelected}>
            Atualizar selecionadas
          </button>
        </div>

        {loading && !data ? (
          <div className="empty"><Spinner /> Carregando empresas do Bitrix24…</div>
        ) : list.length === 0 ? (
          <div className="empty">Nenhuma empresa neste filtro.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Selecionar todas com CNPJ" checked={allSelected} onChange={toggleAll} /></th>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Situação dos dados</th>
                  <th>Prioridade</th>
                  <th>Atualizada em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td><input type="checkbox" aria-label={`Selecionar ${c.title}`} disabled={!c.cnpj} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                    <td><strong>{c.title || `Empresa #${c.id}`}</strong>{c.segment ? <div className="small muted">{c.segment}</div> : null}</td>
                    <td className="num">{c.cnpjFormatado || '—'}</td>
                    <td><span className={`badge ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span></td>
                    <td>{c.grade ? <GradeBadge grade={c.grade} label={String(c.score)} /> : <span className="muted">—</span>}</td>
                    <td className="num small">{formatDate(c.enrichedAt)}</td>
                    <td className="actions"><Link className="btn btn-ghost btn-sm" href={`/empresa/${c.id}`}>{c.cnpj ? 'Revisar' : 'Informar CNPJ'}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
