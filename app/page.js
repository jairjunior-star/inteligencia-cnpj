'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { maskCnpjInput, validateCnpj } from '@/lib/cnpj';
import CompanyReport from './components/CompanyReport';
import { Alert, Spinner } from './components/ui';

export default function ConsultaPage() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(new URLSearchParams(window.location.search).get('pendente') === '1');
    api('/api/auth/me', { redirectOnAuth: false })
      .then((me) => {
        if (!me.authenticated) window.location.href = me.hasPortals ? '/entrar' : '/configuracao';
        else if (!me.portal.configured && me.user.admin) window.location.href = '/configuracao';
        else if (!me.portal.configured) setPending(true);
      })
      .catch(() => {});
  }, []);

  const check = validateCnpj(input);
  const showInvalid = input.replace(/[^0-9a-z]/gi, '').length >= 14 && !check.valid;

  async function consultar(e, force = false) {
    e?.preventDefault();
    if (!check.valid) {
      setError(check.reason);
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      setResult(await api(`/api/cnpj/${check.cnpj}${force ? '?force=1' : ''}`));
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function cadastrar() {
    setSaving(true);
    setError(null);
    try {
      const r = await api('/api/crm/companies', { method: 'POST', body: { cnpj: result.cnpj } });
      setNotice({ level: 'ok', text: `Empresa "${r.title}" cadastrada no CRM (#${r.id}) com score ${r.intel.score}.`, companyId: r.id });
      setResult((prev) => ({ ...prev, crm: { ...prev.crm, matches: [{ id: r.id, title: r.title }] } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const match = result?.crm?.matches?.[0];
  const actions = result && (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => consultar(e, true)} disabled={loading}>Buscar de novo na Receita</button>
      {match ? (
        <Link className="btn btn-primary" href={`/empresa/${match.id}?cnpj=${result.cnpj}`}>Atualizar empresa no CRM</Link>
      ) : (
        <button type="button" className="btn btn-primary" onClick={cadastrar} disabled={saving || pending}>
          {saving ? <Spinner label="Cadastrando" /> : null}Cadastrar no CRM
        </button>
      )}
    </>
  );

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Consultar CNPJ</h1>
          <p>Digite o CNPJ para ver os dados da Receita Federal, o segmento, o porte e o potencial comercial. Depois, cadastre ou atualize a empresa no CRM com um clique.</p>
        </div>
      </div>

      {pending && <Alert level="aviso">A configuração do aplicativo ainda não foi concluída. Peça a um administrador do Bitrix24 para abrir o app e finalizar a configuração.</Alert>}

      <form className="card row" onSubmit={consultar} noValidate>
        <label className="field" style={{ flex: '1 1 320px' }} htmlFor="cnpj">
          CNPJ
          <input
            id="cnpj"
            className="cnpj-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="00.000.000/0000-00"
            value={input}
            onChange={(e) => setInput(maskCnpjInput(e.target.value))}
            aria-invalid={showInvalid}
            aria-describedby="cnpj-hint"
          />
          <span id="cnpj-hint" className="hint">
            {showInvalid ? <span style={{ color: 'var(--bad)' }}>{check.reason}</span> : 'Aceita o CNPJ numérico e o novo CNPJ alfanumérico.'}
          </span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ alignSelf: 'center' }}>
          {loading ? <Spinner label="Consultando" /> : null}Consultar
        </button>
      </form>

      {error && <Alert level="erro">{error}</Alert>}
      {notice && (
        <Alert level={notice.level}>
          <span>{notice.text} {notice.companyId ? <Link href={`/empresa/${notice.companyId}`}>Ver empresa</Link> : null}</span>
        </Alert>
      )}
      {result?.crm?.error && <Alert level="aviso">Não foi possível verificar o CRM agora: {result.crm.error}</Alert>}
      {match && !notice && (
        <Alert level="info">Este CNPJ já está no CRM como <strong>{match.title}</strong> (#{match.id}). Use “Atualizar empresa no CRM” para trazer os dados mais recentes.</Alert>
      )}

      {result && <CompanyReport result={result} actions={actions} />}

      {!result && !loading && !error && (
        <section className="card empty">
          <p>Experimente com o CNPJ de um cliente de teste. Os dados vêm das bases públicas da Receita Federal e ficam guardados por alguns dias para evitar consultas repetidas.</p>
        </section>
      )}
    </main>
  );
}
