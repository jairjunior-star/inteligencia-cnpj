'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { Alert, Spinner } from '../components/ui';

const WEIGHT_LABELS = {
  porte: 'Porte da empresa',
  idade: 'Tempo de atividade',
  capital: 'Capital social',
  contato: 'Contato disponível',
  segmento: 'Segmento-alvo',
};

function Steps({ current, done, showPlacement }) {
  const steps = ['Conexão', 'Campos do CRM', 'Preferências'];
  if (showPlacement) steps.push('Aba na empresa');
  return (
    <ol className="steps" aria-label="Etapas da configuração" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {steps.map((s, i) => (
        <li key={s} className={`step ${i === current ? 'current' : ''} ${done[i] ? 'done' : ''}`}>
          <span className="n">{done[i] ? '✓' : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

function ConnectionStep({ me, onDone }) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(!me?.authenticated);

  if (me?.authenticated && me.user.mode === 'app') {
    return (
      <section className="card stack">
        <h2>1. Conexão com o Bitrix24</h2>
        <Alert level="ok">Conectado pelo próprio Bitrix24 ({me.portal.domain}). O app usa o login de cada usuário e respeita as permissões dele no CRM.</Alert>
      </section>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (password && password !== password2) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    try {
      const r = await api('/api/setup/connection', { method: 'POST', body: { webhookUrl, password: password || undefined }, redirectOnAuth: false });
      setResult(r);
      setEditing(false);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card stack">
      <h2>1. Conexão com o Bitrix24</h2>
      {result && <Alert level="ok">Conexão testada e salva. Usuário do webhook: {result.webhookUser.name}.</Alert>}
      {result?.warning && <Alert level="aviso">{result.warning}</Alert>}
      {me?.authenticated && !editing ? (
        <div className="row">
          <Alert level="ok">Conectado ao portal {me.portal.domain} por webhook.</Alert>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Trocar webhook</button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="grid grid-2">
            <div className="stack">
              <p>Há duas formas de conectar:</p>
              <ul className="clean small">
                <li><strong>Instalando como aplicativo</strong> no Bitrix24 (recomendado): abra o app pelo menu Aplicativos e esta etapa é feita sozinha.</li>
                <li><strong>Webhook de entrada</strong>: siga os passos ao lado e cole a URL aqui.</li>
              </ul>
              <label className="field" htmlFor="webhook">
                URL do webhook de entrada
                <input id="webhook" type="text" placeholder="https://suaempresa.bitrix24.com.br/rest/1/xxxxxxxx/" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} autoComplete="off" required />
                <span className="hint">Fica guardada criptografada. Não é exibida de novo.</span>
              </label>
              <label className="field" htmlFor="senha">
                {me?.authenticated ? 'Nova senha de acesso (opcional)' : 'Crie uma senha de acesso ao app'}
                <input id="senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required={!me?.authenticated} />
                <span className="hint">Mínimo de 8 caracteres. Protege o acesso direto ao app.</span>
              </label>
              <label className="field" htmlFor="senha2">
                Repita a senha
                <input id="senha2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required={!me?.authenticated || Boolean(password)} />
              </label>
              {error && <Alert level="erro">{error}</Alert>}
              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <Spinner /> : null}Testar e salvar</button>
                {!me?.authenticated && <Link href="/entrar" className="small">Já configurei: entrar</Link>}
              </div>
            </div>
            <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
              <h3>Como criar o webhook no Bitrix24</h3>
              <ol className="howto" style={{ marginTop: 10 }}>
                <li>No Bitrix24, abra <strong>Aplicativos → Recursos para desenvolvedores</strong>.</li>
                <li>Escolha <strong>Outro → Webhook de entrada</strong>.</li>
                <li>Marque os escopos <code>CRM (crm)</code> e <code>Usuários (user)</code>. Se o seu portal não tiver “a fazer” no CRM, marque também <code>Tarefas (task)</code>.</li>
                <li>Clique em <strong>Salvar</strong> e copie a URL do webhook.</li>
              </ol>
              <p className="small muted" style={{ marginTop: 10 }}>O app vai agir com as permissões do usuário que criou o webhook. Prefira um usuário com acesso de edição às empresas do CRM.</p>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}

function FieldsStep({ enabled, onDone }) {
  const [info, setInfo] = useState(null);
  const [cnpjField, setCnpjField] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setError(null);
    try {
      const r = await api('/api/setup/fields');
      setInfo(r);
      const appField = r.fields.find((f) => f.key === 'cnpj');
      setCnpjField(r.map.cnpj && r.map.cnpj !== appField?.fieldName ? r.map.cnpj : '');
      if (r.fields.every((f) => f.exists) || r.map.cnpj) onDone(Boolean(r.map.cnpj && r.fields.every((f) => f.exists || f.key === 'cnpj')));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (enabled) load();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const r = await api('/api/setup/fields', { method: 'POST', body: { cnpjField: cnpjField || null } });
      setMsg(r.created ? `${r.created} campos criados no cadastro de empresas.` : 'Todos os campos já existiam. Mapeamento salvo.');
      await load();
      onDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!enabled) {
    return <section className="card"><h2>2. Campos do CRM</h2><p className="muted" style={{ marginTop: 8 }}>Conclua a conexão primeiro.</p></section>;
  }

  const otherCandidates = (info?.cnpjCandidates || []).filter((c) => !String(c.xml || '').startsWith('CNPJI_'));
  const missing = info?.fields.filter((f) => !f.exists).length ?? 0;

  return (
    <section className="card stack">
      <h2>2. Campos do CRM</h2>
      <p>O app guarda os dados da Receita em campos próprios no cadastro de empresas. Eles são criados aqui e reconhecidos pelo código interno, sem depender de IDs fixos.</p>
      {error && <Alert level="erro">{error}</Alert>}
      {msg && <Alert level="ok">{msg}</Alert>}
      {!info ? <div className="empty"><Spinner /> Lendo os campos do portal…</div> : (
        <>
          {otherCandidates.length > 0 && (
            <label className="field" htmlFor="cnpj-field">
              Seu portal já tem um campo de CNPJ?
              <select id="cnpj-field" value={cnpjField} onChange={(e) => setCnpjField(e.target.value)}>
                <option value="">Não, usar o campo “CNPJ” criado pelo app</option>
                {otherCandidates.map((c) => <option key={c.fieldName} value={c.fieldName}>{c.label} ({c.fieldName})</option>)}
              </select>
              <span className="hint">Usar o campo que o time já preenche evita CNPJ duplicado em dois lugares.</span>
            </label>
          )}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Campo</th><th>Tipo</th><th>Situação</th></tr></thead>
              <tbody>
                {info.fields.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}{f.fieldName ? <div className="small muted">{f.fieldName}</div> : null}</td>
                    <td className="small">{f.type === 'double' ? 'Número' : f.type === 'date' ? 'Data' : f.type === 'datetime' ? 'Data e hora' : 'Texto'}</td>
                    <td>{f.key === 'cnpj' && cnpjField ? <span className="badge badge-info">Usará o campo do portal</span> : f.exists ? <span className="badge badge-ok">Pronto</span> : <span className="badge badge-warn">Será criado</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={create} disabled={loading}>
              {loading ? <Spinner /> : null}{missing ? `Criar ${missing} campos e salvar` : 'Salvar mapeamento'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function SettingsStep({ enabled, onDone }) {
  const [form, setForm] = useState(null);
  const [segments, setSegments] = useState([]);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    api('/api/setup/settings')
      .then((r) => {
        setForm(r.settings);
        setSegments(r.segments);
      })
      .catch((err) => setError(err.message));
  }, [enabled]);

  if (!enabled) return <section className="card"><h2>3. Preferências</h2><p className="muted" style={{ marginTop: 8 }}>Conclua os campos do CRM primeiro.</p></section>;
  if (!form) return <section className="card"><h2>3. Preferências</h2>{error ? <Alert level="erro">{error}</Alert> : <div className="empty"><Spinner /></div>}</section>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setW = (k, v) => setForm((f) => ({ ...f, weights: { ...f.weights, [k]: v } }));
  const toggleSeg = (s) => set('targetSegments', form.targetSegments.includes(s) ? form.targetSegments.filter((x) => x !== s) : [...form.targetSegments, s]);
  const totalW = Object.values(form.weights).reduce((a, b) => a + (Number(b) || 0), 0) || 1;

  async function save(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const body = { ...form, ttlDays: Number(form.ttlDays), staleDays: Number(form.staleDays), followUpDays: Number(form.followUpDays), weights: Object.fromEntries(Object.entries(form.weights).map(([k, v]) => [k, Number(v)])) };
      const r = await api('/api/setup/settings', { method: 'POST', body });
      setForm(r.settings);
      setMsg('Preferências salvas.');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>3. Preferências</h2>
      {error && <Alert level="erro">{error}</Alert>}
      {msg && <Alert level="ok">{msg}</Alert>}
      <div className="grid grid-3">
        <label className="field" htmlFor="ttl">
          Guardar consultas por (dias)
          <input id="ttl" type="number" min={0} max={365} value={form.ttlDays} onChange={(e) => set('ttlDays', e.target.value)} />
          <span className="hint">Evita consultar a Receita de novo para o mesmo CNPJ.</span>
        </label>
        <label className="field" htmlFor="stale">
          Considerar desatualizada após (dias)
          <input id="stale" type="number" min={1} max={730} value={form.staleDays} onChange={(e) => set('staleDays', e.target.value)} />
          <span className="hint">Usado na lista de empresas do CRM.</span>
        </label>
        <label className="field" htmlFor="title-from">
          Nome da empresa no CRM
          <select id="title-from" value={form.titleFrom} onChange={(e) => set('titleFrom', e.target.value)}>
            <option value="fantasia">Nome fantasia (ou razão social, se não houver)</option>
            <option value="razao">Razão social</option>
          </select>
        </label>
      </div>
      <label className="checkbox" htmlFor="timeline">
        <input id="timeline" type="checkbox" checked={form.timelineComment} onChange={(e) => set('timelineComment', e.target.checked)} />
        Registrar um comentário na timeline da empresa a cada cadastro ou atualização
      </label>

      <div className="stack" style={{ gap: 8 }}>
        <h3>Follow-up automático</h3>
        <label className="checkbox" htmlFor="followup">
          <input id="followup" type="checkbox" checked={form.autoFollowUp} onChange={(e) => set('autoFollowUp', e.target.checked)} />
          Criar um “a fazer” de follow-up para o responsável quando a empresa for de alta prioridade (A)
        </label>
        <label className="field" htmlFor="followup-days" style={{ maxWidth: 280 }}>
          Prazo do follow-up (dias)
          <input id="followup-days" type="number" min={0} max={30} value={form.followUpDays} disabled={!form.autoFollowUp} onChange={(e) => set('followUpDays', e.target.value)} />
          <span className="hint">Criado só uma vez, quando a empresa passa a ser A.</span>
        </label>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>Segmentos-alvo</h3>
        <p className="small muted">Marque os segmentos que o seu time mais quer atender. Eles aumentam o score de potencial.</p>
        <div className="grid grid-3" style={{ gap: 8 }}>
          {segments.map((s) => (
            <label key={s} className="checkbox" htmlFor={`seg-${s}`}>
              <input id={`seg-${s}`} type="checkbox" checked={form.targetSegments.includes(s)} onChange={() => toggleSeg(s)} />{s}
            </label>
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>Critérios e pesos do score</h3>
        <p className="small muted">Defina quanto cada critério pesa no score de 0 a 100. Use 0 para ignorar um critério.</p>
        <div className="grid grid-3">
          {Object.keys(WEIGHT_LABELS).map((k) => (
            <label key={k} className="field" htmlFor={`w-${k}`}>
              {WEIGHT_LABELS[k]} <span className="hint">({Math.round(((Number(form.weights[k]) || 0) / totalW) * 100)}% do score)</span>
              <input id={`w-${k}`} type="number" min={0} max={100} value={form.weights[k]} onChange={(e) => setW(k, e.target.value)} />
            </label>
          ))}
        </div>
      </div>
      <div className="row"><button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <Spinner /> : null}Salvar preferências</button></div>
    </form>
  );
}

function PlacementStep({ bound }) {
  const [done, setDone] = useState(bound);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  async function bind() {
    setLoading(true);
    setError(null);
    try {
      await api('/api/setup/placement', { method: 'POST', body: {} });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="card stack">
      <h2>4. Aba no cadastro da empresa</h2>
      <p>Adicione a aba “Inteligência de CNPJ” dentro de cada empresa do CRM, para atualizar os dados sem sair do cadastro.</p>
      {error && <Alert level="erro">{error}</Alert>}
      {done ? <Alert level="ok">A aba já está disponível nas empresas do CRM.</Alert> : (
        <div className="row"><button type="button" className="btn btn-secondary" onClick={bind} disabled={loading}>{loading ? <Spinner /> : null}Adicionar aba</button></div>
      )}
    </section>
  );
}

function InstallInBitrix() {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const items = [
    { k: 'handler', label: 'Caminho do manipulador', v: `${origin}/api/bitrix/app` },
    { k: 'install', label: 'Caminho inicial de instalação', v: `${origin}/api/bitrix/install` },
  ];
  async function copy(k, v) {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(k);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }
  const isHttps = origin.startsWith('https://');
  return (
    <section className="card stack">
      <h2>Instalar dentro do Bitrix24 (opcional)</h2>
      <p className="small muted">Com o app instalado, ele abre pelo menu Aplicativos do Bitrix24, usa o login de cada usuário e pode ganhar a aba “Inteligência de CNPJ” no cadastro da empresa.</p>
      {!isHttps && origin && <Alert level="aviso">Este endereço não é HTTPS. O Bitrix24 só aceita aplicativos em endereços HTTPS públicos.</Alert>}
      <ol className="howto">
        <li>No Bitrix24, abra <strong>Aplicativos → Recursos para desenvolvedores → Outro → Aplicativo local</strong>.</li>
        <li>Cole os dois endereços abaixo nos campos de mesmo nome.</li>
        <li>Em permissões, marque <code>CRM (crm)</code>, <code>Usuários (user)</code>, <code>Incorporação de aplicativos (placement)</code> e <code>Tarefas (task)</code>.</li>
        <li>Dê o nome <strong>Inteligência de CNPJ</strong> ao item de menu, deixe desmarcado “Usar apenas API” e salve.</li>
        <li>Abra o app pelo menu Aplicativos e, como administrador, volte aqui para adicionar a aba na empresa.</li>
      </ol>
      <div className="stack" style={{ gap: 10 }}>
        {items.map((i) => (
          <div key={i.k} className="copy-row">
            <span className="small"><strong>{i.label}</strong></span>
            <code className="copy-value">{i.v}</code>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => copy(i.k, i.v)}>{copied === i.k ? 'Copiado' : 'Copiar'}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ConfiguracaoPage() {
  const [me, setMe] = useState(undefined);
  const [connected, setConnected] = useState(false);
  const [fieldsDone, setFieldsDone] = useState(false);
  const [settingsDone, setSettingsDone] = useState(false);

  async function refresh() {
    const r = await api('/api/auth/me', { redirectOnAuth: false }).catch(() => ({ authenticated: false }));
    setMe(r);
    setConnected(Boolean(r.authenticated));
    if (r.portal?.configured) setFieldsDone(true);
  }

  useEffect(() => { refresh(); }, []);

  if (me === undefined) return <main className="page"><div className="card empty"><Spinner /></div></main>;

  if (me.authenticated && !me.user.admin) {
    return (
      <main className="page">
        <h1>Configuração</h1>
        <Alert level="aviso">Somente administradores do Bitrix24 podem alterar a configuração do aplicativo.</Alert>
      </main>
    );
  }

  const isApp = me.user?.mode === 'app';
  const current = !connected ? 0 : !fieldsDone ? 1 : 2;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Configuração</h1>
          <p>Três passos para começar: conectar o portal, criar os campos no CRM e ajustar as preferências. Dá para voltar aqui quando quiser.</p>
        </div>
        {fieldsDone && <Link className="btn btn-primary" href="/">Começar a consultar</Link>}
      </div>
      <Steps current={current} done={[connected, fieldsDone, settingsDone, me.portal?.placementBound]} showPlacement={isApp} />
      <ConnectionStep me={me} onDone={refresh} />
      <FieldsStep enabled={connected} onDone={(ok) => ok && setFieldsDone(true)} />
      <SettingsStep enabled={connected && fieldsDone} onDone={() => setSettingsDone(true)} />
      {isApp && fieldsDone && <PlacementStep bound={me.portal?.placementBound} />}
      {fieldsDone && !isApp && <InstallInBitrix />}
    </main>
  );
}
