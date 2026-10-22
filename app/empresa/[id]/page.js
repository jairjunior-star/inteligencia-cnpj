'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, formatDate, bitrixCompanyUrl } from '@/lib/client';
import { maskCnpjInput, validateCnpj } from '@/lib/cnpj';
import CompanyReport from '../../components/CompanyReport';
import { Alert, Spinner, ChangesTable } from '../../components/ui';

export default function EmpresaPage() {
  const { id } = useParams();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(null);
  const [cnpjInput, setCnpjInput] = useState('');
  const [inTab, setInTab] = useState(false);
  const [domain, setDomain] = useState(null);

  useEffect(() => {
    api('/api/auth/me', { redirectOnAuth: false }).then((me) => setDomain(me.portal?.domain || null)).catch(() => {});
  }, []);

  const load = useCallback(
    async ({ cnpj = null, force = false } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (cnpj) qs.set('cnpj', cnpj);
        if (force) qs.set('force', '1');
        setPreview(await api(`/api/crm/companies/${id}${qs.toString() ? `?${qs}` : ''}`));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setInTab(sp.get('aba') === '1');
    const c = sp.get('cnpj');
    load({ cnpj: c && validateCnpj(c).valid ? c : null });
  }, [load]);

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const body = preview.company.cnpj ? {} : { cnpj: preview.cnpj };
      const r = await api(`/api/crm/companies/${id}`, { method: 'POST', body });
      setDone(r.updated ? `Empresa atualizada no CRM (${r.changes.length} ${r.changes.length === 1 ? 'campo' : 'campos'}).` : 'A empresa já estava com os dados em dia.');
      await load({});
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  const check = validateCnpj(cnpjInput);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          {!inTab && <Link href="/empresas" className="small">← Empresas do CRM</Link>}
          <h1 style={{ marginTop: 6 }}>{preview?.company?.title || `Empresa #${id}`}</h1>
          <p>
            Empresa #{id} no Bitrix24
            {preview?.company?.enrichedAt ? ` · dados da Receita atualizados em ${formatDate(preview.company.enrichedAt, true)}` : ' · ainda não atualizada pelo app'}
          </p>
        </div>
        {domain && !inTab && (
          <a className="btn btn-secondary" href={bitrixCompanyUrl(domain, id)} target="_blank" rel="noopener noreferrer">Abrir no Bitrix24</a>
        )}
      </div>

      {error && <Alert level="erro">{error}</Alert>}
      {done && <Alert level="ok">{done}</Alert>}
      {loading && !preview && <div className="card empty"><Spinner /> Buscando a empresa no CRM e os dados da Receita…</div>}

      {preview?.needsCnpj && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (check.valid) load({ cnpj: check.cnpj });
          }}
        >
          <h2>Esta empresa ainda não tem CNPJ no CRM</h2>
          <p>Informe o CNPJ para buscar os dados na Receita Federal. Você vai ver o que muda antes de gravar.</p>
          <div className="row">
            <label className="field" style={{ flex: '1 1 280px' }} htmlFor="cnpj-empresa">
              CNPJ
              <input id="cnpj-empresa" className="cnpj-input" type="text" value={cnpjInput} placeholder="00.000.000/0000-00" onChange={(e) => setCnpjInput(maskCnpjInput(e.target.value))} />
              {cnpjInput.replace(/[^0-9a-z]/gi, '').length >= 14 && !check.valid && <span className="hint" style={{ color: 'var(--bad)' }}>{check.reason}</span>}
            </label>
            <button type="submit" className="btn btn-primary" disabled={!check.valid || loading}>Buscar dados</button>
          </div>
        </form>
      )}

      {preview && !preview.needsCnpj && (
        <>
          <section className="card stack">
            <div className="card-head" style={{ marginBottom: 0 }}>
              <h2>O que muda no CRM</h2>
              <div className="row">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => load({ cnpj: preview.company.cnpj ? null : preview.cnpj, force: true })} disabled={loading}>
                  Buscar de novo na Receita
                </button>
                <button type="button" className="btn btn-primary" onClick={apply} disabled={applying || !preview.changes.length}>
                  {applying ? <Spinner label="Gravando" /> : null}Aplicar no CRM
                </button>
              </div>
            </div>
            <p className="small muted">Nome e endereço que já estão preenchidos não são alterados. Telefones e e-mails novos são adicionados, sem apagar os existentes.</p>
            <ChangesTable changes={preview.changes} />
          </section>
          <CompanyReport result={preview} />
        </>
      )}
    </main>
  );
}
