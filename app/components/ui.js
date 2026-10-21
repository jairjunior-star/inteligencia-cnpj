'use client';

export function Alert({ level = 'info', children }) {
  return <div className={`alert alert-${level}`} role={level === 'erro' ? 'alert' : 'status'}>{children}</div>;
}

export function Spinner({ label = 'Carregando' }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function SituacaoBadge({ situacao }) {
  const s = (situacao || '').toUpperCase();
  const cls = s === 'ATIVA' ? 'badge-ok' : s ? 'badge-bad' : 'badge-muted';
  return <span className={`badge ${cls}`}>{s || 'Sem situação'}</span>;
}

export function GradeBadge({ grade, label }) {
  if (!grade) return <span className="badge badge-muted">Sem score</span>;
  const cls = grade === 'A' ? 'badge-ok' : grade === 'B' ? 'badge-info' : 'badge-warn';
  return <span className={`badge ${cls}`}>{grade}{label ? ` · ${label}` : ''}</span>;
}

export function ChangesTable({ changes }) {
  if (!changes?.length) return <Alert level="ok">Os dados do CRM já estão iguais aos da Receita. Nada para atualizar.</Alert>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Campo</th><th>No CRM hoje</th><th>Vai ficar</th></tr>
        </thead>
        <tbody>
          {changes.map((c, i) => (
            <tr key={i}>
              <td><strong>{c.field}</strong></td>
              <td className="muted">{String(c.from ?? '') || '(vazio)'}</td>
              <td>{String(c.to ?? '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
