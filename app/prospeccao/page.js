'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, formatDate } from '@/lib/client';
import { extractCnpjs } from '@/lib/cnpj';
import ProspectExplorer from '../components/Prospect';
import { Alert, Spinner, Icon, SectionTitle } from '../components/ui';

function downloadTemplate() {
  const csv = 'cnpj;empresa;observacao\n11.222.333/0001-81;Empresa exemplo;Troque pelos CNPJs da sua lista\n';
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-lista-cnpjs.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NewList({ onCreated }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => extractCnpjs(text), [text]);

  function readFile(file) {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setError('Arquivos do Excel (.xlsx) não são lidos direto. No Excel, use Arquivo → Salvar como → CSV, ou copie a coluna de CNPJs e cole aqui.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError(null);
      setText(String(reader.result || ''));
      if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.onerror = () => setError('Não foi possível ler o arquivo.');
    reader.readAsText(file);
  }

  async function create(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api('/api/listas', { method: 'POST', body: { name, cnpjs: parsed.valid } });
      onCreated(r.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card stack" onSubmit={create}>
      <SectionTitle icon="plus">Nova lista de prospecção</SectionTitle>
      <p className="small muted">Cole uma coluna de CNPJs (do Excel, de uma feira, de uma associação…) ou envie um arquivo CSV. O app confere cada CNPJ, busca os dados na Receita e calcula o score. Até 1.000 por lista. Outras colunas (nome, cidade, observação) são ignoradas.{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={downloadTemplate}><Icon name="file" size={14} />Baixar modelo de CSV</button></p>
      <div className="grid grid-2">
        <label className="field" htmlFor="list-name">
          Nome da lista
          <input id="list-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Feira do Varejo 2026" required />
        </label>
        <label className="field" htmlFor="list-file">
          Arquivo CSV (opcional)
          <input id="list-file" type="file" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
      </div>
      <label className="field" htmlFor="list-text">
        CNPJs
        <textarea id="list-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'11.222.333/0001-81\n45321987000184\n…'} />
      </label>
      <div className="row">
        <span className="badge badge-ok">{parsed.valid.length} válidos</span>
        {parsed.invalid.length > 0 && <span className="badge badge-bad" title={parsed.invalid.slice(0, 10).join(', ')}>{parsed.invalid.length} inválidos</span>}
        {parsed.duplicates > 0 && <span className="badge badge-muted">{parsed.duplicates} repetidos</span>}
        <span className="spacer" />
        <button type="submit" className="btn btn-primary" disabled={saving || !parsed.valid.length || !name.trim()}>
          {saving ? <Spinner /> : <Icon name="sparkle" size={16} />}Criar lista e analisar
        </button>
      </div>
      {error && <Alert level="erro">{error}</Alert>}
    </form>
  );
}

function Lists({ refresh }) {
  const [lists, setLists] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    try {
      setLists((await api('/api/listas')).lists);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, [refresh]);

  async function remove(id) {
    await api(`/api/listas/${id}`, { method: 'DELETE' }).catch((err) => setError(err.message));
    setConfirm(null);
    load();
  }

  return (
    <section className="card stack">
      <SectionTitle icon="file">Suas listas</SectionTitle>
      {error && <Alert level="erro">{error}</Alert>}
      {!lists ? <div className="empty"><Spinner /></div> : lists.length === 0 ? (
        <p className="muted small">Nenhuma lista ainda. Crie a primeira acima.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Lista</th><th>Criada em</th><th>Análise</th><th>Importadas</th><th /></tr></thead>
            <tbody>
              {lists.map((l) => {
                const c = l.counts;
                const pct = c.total ? Math.round(((c.total - c.pendente) / c.total) * 100) : 0;
                return (
                  <tr key={l.id}>
                    <td><Link href={`/prospeccao/lista/${l.id}`}><strong>{l.name}</strong></Link><div className="small muted">{c.total} CNPJs{l.createdBy ? ` · por ${l.createdBy}` : ''}</div></td>
                    <td className="small num">{formatDate(l.createdAt, true)}</td>
                    <td style={{ minWidth: 160 }}>
                      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                      <div className="small muted">{c.pendente ? `${pct}% analisada` : `${c.pronto} prontas${c.nao_encontrado ? ` · ${c.nao_encontrado} não encontradas` : ''}${c.erro ? ` · ${c.erro} com erro` : ''}`}</div>
                    </td>
                    <td className="num">{c.importadas}</td>
                    <td className="actions">
                      {confirm === l.id ? (
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          <span className="small">Excluir a lista?</span>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm(null)}>Não</button>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => remove(l.id)}>Sim, excluir</button>
                        </span>
                      ) : (
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          <Link className="btn btn-sm btn-secondary" href={`/prospeccao/lista/${l.id}`}>Abrir</Link>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm(l.id)}>Excluir</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Base() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  async function load() {
    try {
      setData(await api('/api/base'));
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);
  if (error) return <Alert level="erro">{error}</Alert>;
  if (!data) return <div className="card empty"><Spinner /> Carregando a base…</div>;
  return (
    <div className="stack">
      <Alert level="info">A base reúne todas as empresas que o app já analisou: consultas, listas e empresas do CRM ({data.options.total} no total). Filtre por CNAE, segmento, porte e região para montar a sua lista de prospecção.</Alert>
      <ProspectExplorer rows={data.items} exportName="base-prospeccao" onReload={load} />
    </div>
  );
}

export default function ProspeccaoPage() {
  const [tab, setTab] = useState('listas');
  const [refresh, setRefresh] = useState(0);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow eyebrow-light"><Icon name="target" size={14} /> Prospecção</span>
          <h1 style={{ marginTop: 10 }}>Listas que viram negócios.</h1>
          <p>Suba uma lista de CNPJs, veja quem vale a pena procurar e leve para o funil do Bitrix24 com responsável e follow-up. Ou garimpe na base por CNAE, segmento e região.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Prospecção">
        <button type="button" role="tab" aria-selected={tab === 'listas'} className={tab === 'listas' ? 'active' : ''} onClick={() => setTab('listas')}><Icon name="file" size={15} /> Listas</button>
        <button type="button" role="tab" aria-selected={tab === 'base'} className={tab === 'base' ? 'active' : ''} onClick={() => setTab('base')}><Icon name="search" size={15} /> Buscar na base</button>
      </div>
      {tab === 'listas' ? (
        <>
          <NewList onCreated={(id) => { setRefresh((x) => x + 1); window.location.href = `/prospeccao/lista/${id}`; }} />
          <Lists refresh={refresh} />
        </>
      ) : (
        <Base />
      )}
    </main>
  );
}
