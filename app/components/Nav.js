'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, SESSION_STORAGE_KEY } from '@/lib/client';
import { Icon } from './ui';

function Brand() {
  return (
    <>
      <span className="brand-mark"><Icon name="search" size={18} /></span>
      <span className="brand-text">Inteligência de CNPJ<small>para Bitrix24</small></span>
    </>
  );
}

const LINKS = [
  { href: '/', label: 'Consultar CNPJ' },
  { href: '/prospeccao', label: 'Prospecção' },
  { href: '/empresas', label: 'Empresas do CRM' },
  { href: '/painel', label: 'Painel' },
  { href: '/logs', label: 'Logs' },
];

export default function Nav() {
  const path = usePathname();
  const [me, setMe] = useState(null);

  useEffect(() => {
    api('/api/auth/me', { redirectOnAuth: false }).then(setMe).catch(() => setMe(null));
  }, [path]);

  if (path === '/entrar') {
    return (
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand"><Brand /></span>
        </div>
      </header>
    );
  }

  async function logout() {
    try { window.sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
    await api('/api/auth/logout', { method: 'POST', redirectOnAuth: false }).catch(() => {});
    window.location.href = '/entrar';
  }

  const isActive = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  const admin = me?.user?.admin;

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand"><Brand /></Link>
        {me?.authenticated && (
          <nav className="nav" aria-label="Menu principal">
            {LINKS.filter((l) => !l.admin || admin).map((l) => (
              <Link key={l.href} href={l.href} className={isActive(l.href) ? 'active' : undefined}>{l.label}</Link>
            ))}
          </nav>
        )}
        {me?.authenticated && (
          <div className="who">
            {admin && (
              <Link href="/configuracao" className={`icon-btn ${isActive('/configuracao') ? 'active' : ''}`} aria-label="Configuração" title="Configuração">
                <Icon name="settings" size={18} />
              </Link>
            )}
            <span className="who-chip" title={`${me.user.name} · ${me.portal.domain}`}>
              <span className="avatar" aria-hidden="true">{(me.user.name || '?').trim().slice(0, 1).toUpperCase()}</span>
              <span className="who-text"><strong>{me.user.name}</strong><small>{me.portal.domain}</small></span>
            </span>
            {me.user.mode === 'webhook' && <button type="button" className="logout" onClick={logout}>Sair</button>}
          </div>
        )}
      </div>
    </header>
  );
}
