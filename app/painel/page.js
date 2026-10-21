'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatDate } from '@/lib/client';
import { Alert, Spinner, GradeBadge } from '../components/ui';

function Bars({ items }) {
  if (!items?.length) return <p className="muted small">Ainda sem dados.</p>;
  const max = Math.max(...items.map((i) => i.count)) || 1;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {items.map((i) => (
        <div className="hbar" key={i.label}>
          <span>{i.label}</span>
          <span className="count">{i.count}</span>
          <div className="track"><span style={{ width: `${(i.count / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function PainelPage() {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/api/stats').then(setS).catch((err) => setError(err.message));
  }, []);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Painel</h1>
          <p>Como está a base de empresas enriquecidas pelo app: prioridades comerciais, segmentos, porte e qualidade dos dados no CRM.</p>
        </div>
      </div>
      {error && <Alert level="erro">{error}</Alert>}
      {!s && !error && <div className="card empty"><Spinner /> Carregando indicadores…</div>}
      {s && (
        <>
          <div className="grid grid-4">
            <div className="card kpi"><span className="v">{s.enriquecidas}</span><span className="l">Empresas enriquecidas</span></div>
            <div className="card kpi"><span className="v">{s.scoreMedio ?? '—'}</span><span className="l">Score médio (empresas ativas)</span></div>
            <div className="card kpi"><span className="v">{s.prioridade.A}</span><span className="l">Alta prioridade (A)</span></div>
            <div className="card kpi"><span className="v">{s.operacoes7dias}</span><span className="l">Cadastros e atualizações em 7 dias</span></div>
          </div>

          <div className="grid grid-3">
            <section className="card stack">
              <h2>Prioridade comercial</h2>
              <Bars items={[
                { label: 'A · Alta prioridade', count: s.prioridade.A },
                { label: 'B · Média prioridade', count: s.prioridade.B },
                { label: 'C · Baixa prioridade', count: s.prioridade.C },
                { label: 'Inativas (não prospectar)', count: s.inativas },
              ]} />
            </section>
            <section className="card stack"><h2>Por segmento</h2><Bars items={s.porSegmento} /></section>
            <section className="card stack"><h2>Por porte</h2><Bars items={s.porPorte} /></section>
          </div>

          <div className="grid grid-2">
            <section className="card stack">
              <h2>Melhores oportunidades</h2>
              {s.top.length === 0 ? <p className="muted small">Consulte ou atualize empresas para ver o ranking.</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Empresa</th><th>Segmento</th><th>Score</th></tr></thead>
                    <tbody>
                      {s.top.map((t) => (
                        <tr key={t.cnpj}>
                          <td>{t.companyId ? <Link href={`/empresa/${t.companyId}`}>{t.title}</Link> : t.title}<div className="small muted num">{t.cnpjFormatado}</div></td>
                          <td className="small">{t.segment}</td>
                          <td><GradeBadge grade={t.grade} label={String(t.score)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <div className="stack">
              <section className="card stack">
                <h2>Qualidade dos dados no CRM</h2>
                <Bars items={[
                  { label: 'Atualizadas', count: s.crm.atualizadas },
                  { label: 'Precisam de atualização', count: s.crm.desatualizadas },
                  { label: 'Sem CNPJ', count: s.crm.semCnpj },
                ]} />
                <p className="small muted">{s.crm.total} empresas no CRM{s.crm.syncedAt ? ` · sincronizado em ${formatDate(s.crm.syncedAt, true)}` : ''}. <Link href="/empresas">Ver empresas</Link></p>
              </section>
              <section className="card stack"><h2>Por estado</h2><Bars items={s.porUf} /></section>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
