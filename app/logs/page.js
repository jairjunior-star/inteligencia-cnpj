'use client';

import { useEffect, useState } from 'react';
import { api, formatDate } from '@/lib/client';
import { Alert, Spinner } from '../components/ui';

const LEVELS = [
  { id: '', label: 'Todos' },
  { id: 'info', label: 'Informações' },
  { id: 'aviso', label: 'Avisos' },
  { id: 'erro', label: 'Erros' },
];
const CLS = { info: 'badge-info', aviso: 'badge-warn', erro: 'badge-bad' };

export default function LogsPage() {
  const [level, setLevel] = useState('');
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLogs(null);
    api(`/api/logs${level ? `?nivel=${level}` : ''}`).then((r) => setLogs(r.logs)).catch((err) => setError(err.message));
  }, [level]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Logs</h1>
          <p>Registro das consultas, cadastros, atualizações e erros deste portal. Tokens e webhooks nunca aparecem aqui.</p>
        </div>
      </div>
      {error && <Alert level="erro">{error}</Alert>}
      <section className="card stack">
        <div className="row" role="group" aria-label="Filtrar por tipo">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" className={`btn btn-sm ${level === l.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLevel(l.id)}>{l.label}</button>
          ))}
        </div>
        {!logs ? <div className="empty"><Spinner /> Carregando…</div> : logs.length === 0 ? <div className="empty">Nenhum registro.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Quando</th><th>Tipo</th><th>Ação</th><th>Descrição</th><th>Usuário</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="num small" style={{ whiteSpace: 'nowrap' }}>{formatDate(l.at, true)}</td>
                    <td><span className={`badge ${CLS[l.level] || 'badge-muted'}`}>{l.level}</span></td>
                    <td className="small">{l.action}</td>
                    <td>{l.message}</td>
                    <td className="small">{l.user || '—'}</td>
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
