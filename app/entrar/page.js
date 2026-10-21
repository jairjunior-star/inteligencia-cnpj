'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { Alert, Spinner } from '../components/ui';

export default function EntrarPage() {
  const [domain, setDomain] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: { domain, password }, redirectOnAuth: false });
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 520 }}>
      <form className="card stack" onSubmit={submit}>
        <h1>Entrar</h1>
        <p className="muted">Se o app está instalado no Bitrix24, abra pelo menu <strong>Aplicativos</strong> do portal. Para o acesso direto, use o endereço do portal e a senha criada na configuração.</p>
        {error && <Alert level="erro">{error}</Alert>}
        <label className="field" htmlFor="domain">
          Endereço do portal Bitrix24
          <input id="domain" type="text" placeholder="suaempresa.bitrix24.com.br" value={domain} onChange={(e) => setDomain(e.target.value)} autoComplete="url" required />
        </label>
        <label className="field" htmlFor="password">
          Senha de acesso
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <Spinner /> : null}Entrar</button>
        <p className="small muted">Primeira vez? <Link href="/configuracao">Configure o aplicativo</Link>.</p>
      </form>
    </main>
  );
}
