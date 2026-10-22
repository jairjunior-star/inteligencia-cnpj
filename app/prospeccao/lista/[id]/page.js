'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, formatDate } from '@/lib/client';
import ProspectExplorer from '../../../components/Prospect';
import { Alert, Spinner, Icon } from '../../../components/ui';

export default function ListaPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/listas/${id}`));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  // Analisa os CNPJs pendentes em pequenos lotes, atualizando a tela a cada lote.
  const process = useCallback(async () => {
    setRunning(true);
    setPaused(null);
    stopRef.current = false;
    let lastLoad = 0;
    while (!stopRef.current) {
      let r;
      try {
        r = await api(`/api/listas/${id}/processar`, { method: 'POST', body: {} });
      } catch (err) {
        setPaused(err.message);
        break;
      }
      setData((d) => (d ? { ...d, list: { ...d.list, counts: r.counts } } : d));
      if (Date.now() - lastLoad > 4000 || r.done) {
        lastLoad = Date.now();
        await load();
      }
      if (r.done) break;
      if (r.pausedBySource) {
        setPaused('As bases públicas da Receita estão limitando as consultas. A análise continua sozinha em 30 segundos.');
        await new Promise((res) => setTimeout(res, 30000));
        setPaused(null);
      }
    }
    setRunning(false);
  }, [id, load]);

  useEffect(() => {
    (async () => {
      await load();
    })();
    return () => { stopRef.current = true; };
  }, [load]);

  useEffect(() => {
    if (data && data.list.counts.pendente > 0 && !running && !paused) process();
  }, [data?.list?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function retry() {
    await api(`/api/listas/${id}/reprocessar`, { method: 'POST', body: {} });
    await load();
    process();
  }

  if (error) return <main className="page"><Alert level="erro">{error}</Alert></main>;
  if (!data) return <main className="page"><div className="card empty"><Spinner /> Carregando a lista…</div></main>;

  const c = data.list.counts;
  const pct = c.total ? Math.round(((c.total - c.pendente) / c.total) * 100) : 0;
  const rows = data.items.map((i) => ({ ...i }));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <Link href="/prospeccao" className="small">← Prospecção</Link>
          <h1 style={{ marginTop: 6 }}>{data.list.name}</h1>
          <p>{c.total} CNPJs · criada em {formatDate(data.list.createdAt, true)}{data.list.createdBy ? ` por ${data.list.createdBy}` : ''} · {c.importadas} importadas para o Bitrix24</p>
        </div>
      </div>

      <section className="card stack">
        <div className="row">
          <strong>{c.pendente ? (running ? 'Analisando CNPJs na Receita…' : 'Análise pausada') : 'Análise concluída'}</strong>
          <span className="spacer" />
          <span className="num small">{c.total - c.pendente} de {c.total}</span>
          {c.pendente > 0 && !running && <button type="button" className="btn btn-sm btn-primary" onClick={process}>Continuar</button>}
          {running && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { stopRef.current = true; }}>Pausar</button>}
        </div>
        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
        <div className="row small">
          <span className="badge badge-ok">{c.pronto} prontas</span>
          {c.nao_encontrado > 0 && <span className="badge badge-muted">{c.nao_encontrado} não encontradas</span>}
          {c.erro > 0 && <><span className="badge badge-bad">{c.erro} com erro</span><button type="button" className="btn btn-sm btn-ghost" onClick={retry}><Icon name="refresh" size={14} /> Tentar de novo</button></>}
          {running && <span className="muted">Pode deixar esta tela aberta ou voltar depois: a análise continua de onde parou.</span>}
        </div>
        {paused && <Alert level="aviso">{paused}</Alert>}
      </section>

      <ProspectExplorer rows={rows} listId={Number(id)} exportName={data.list.name.replace(/[^\w\- ]+/g, '').trim() || 'lista'} onReload={load} />
    </main>
  );
}
