'use client';

const ICONS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.5" /></>,
  refresh: <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />,
  check: <path d="m5 12 5 5 9-10" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pin: <><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  trending: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

/** Ícones de traço (estilo Lucide), herdam a cor do texto. */
export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function SectionTitle({ icon, children, aside }) {
  return (
    <div className="section-title">
      <span className="section-icon"><Icon name={icon} size={16} /></span>
      <h2>{children}</h2>
      {aside ? <span className="spacer" /> : null}
      {aside}
    </div>
  );
}

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
