'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { maskCnpjInput, validateCnpj } from '@/lib/cnpj';
import CompanyReport from './components/CompanyReport';
import { Alert, Spinner, Icon } from './components/ui';

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
    <>
    <section className="hero">
      <div className="hero-inner">
        <span className="eyebrow"><Icon name="sparkle" size={14} /> Inteligência de CNPJ para Bitrix24</span>
        <h1>Digite o CNPJ. <span className="grad">O CRM se preenche sozinho.</span></h1>
        <p>Dados da Receita Federal, segmento, porte e potencial comercial em segundos. Depois, cadastre ou atualize a empresa no Bitrix24 com um clique.</p>
        <form className="search-box" onSubmit={consultar} noValidate>
          <label htmlFor="cnpj" className="sr-only">CNPJ</label>
          <Icon name="search" size={22} className="search-icon" />
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
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? <Spinner label="Consultando" /> : null}Consultar
          </button>
        </form>
        <p id="cnpj-hint" className="hero-hint">
          {showInvalid ? <span className="hint-bad">{check.reason}</span> : 'Aceita o CNPJ numérico e o novo CNPJ alfanumérico.'}
        </p>
        <ul className="hero-points">
          <li><Icon name="check" size={14} /> Bases públicas da Receita</li>
          <li><Icon name="check" size={14} /> Sem cadastro duplicado</li>
          <li><Icon name="check" size={14} /> Score de 0 a 100</li>
        </ul>
      </div>
    </section>
    <main className="page">
      {pending && <Alert level="aviso">A configuração do aplicativo ainda não foi concluída. Peça a um administrador do Bitrix24 para abrir o app e finalizar a configuração.</Alert>}

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
        <div className="grid grid-3 feature-grid">
          <section className="card feature">
            <span className="feature-icon"><Icon name="search" size={20} /></span>
            <h3>1. Consulte</h3>
            <p className="small">Digite o CNPJ e veja situação, atividade, endereço, contatos e sócios direto da Receita Federal.</p>
          </section>
          <section className="card feature">
            <span className="feature-icon"><Icon name="sparkle" size={20} /></span>
            <h3>2. Entenda o potencial</h3>
            <p className="small">Segmento, porte, score de 0 a 100, alertas e uma sugestão de como abordar a empresa.</p>
          </section>
          <section className="card feature">
            <span className="feature-icon"><Icon name="database" size={20} /></span>
            <h3>3. Leve para o CRM</h3>
            <p className="small">Cadastre ou atualize a empresa no Bitrix24 com um clique, sem duplicar e sem apagar o que o time editou.</p>
          </section>
        </div>
      )}
    </main>
    </>
  );
}
