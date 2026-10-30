# Inteligência de CNPJ

Aplicativo para Bitrix24 que consulta e valida CNPJs em bases públicas, cadastra e atualiza empresas no CRM e transforma os dados da Receita Federal em inteligência comercial: segmento, porte, score de potencial (0 a 100), alertas e sugestão de abordagem.

Projeto do **Desafio Vibecode Br24** (card 01, Inteligência de CNPJ).

## O que o app faz

| Requisito do card | Onde está |
|---|---|
| Consultar e validar CNPJs utilizando bases públicas | Tela **Consultar CNPJ**. Valida os dígitos (inclusive do CNPJ alfanumérico de 2026) e consulta a BrasilAPI, com a CNPJ.ws como reserva. |
| Preencher automaticamente informações cadastrais no CRM | Botão **Cadastrar no CRM**: nome, endereço, telefone, e-mail e 12 campos próprios (CNPJ, razão social, situação, abertura, CNAE, segmento, porte, capital, natureza jurídica, score, prioridade e data da atualização). |
| Identificar o segmento de atuação e o porte | Segmento pela CNAE principal (seções e divisões do IBGE) e porte pela Receita, com estimativa de médio ou grande pelo capital social. |
| Permitir a atualização de empresas já cadastradas | Tela **Empresas do CRM** (atualização em lote) e tela da empresa, que mostra a prévia do que muda antes de gravar. |
| Desafio criativo: inteligência comercial | Score configurável por critérios e pesos, prioridade A/B/C, alertas (inativa, filial, MEI, sem contato), sugestão de abordagem por segmento e porte, comentário na timeline e **Painel** com as melhores oportunidades. |

### Prospecção

- **Listas:** cole uma coluna de CNPJs (ou envie um CSV). O app valida, recupera zeros apagados pelo Excel, ignora repetidos e analisa cada CNPJ na Receita em pequenos lotes, com barra de progresso. Dá para pausar e continuar depois.
- **Buscar na base:** filtre tudo o que o app já analisou por CNAE (código ou descrição), segmento, porte, UF, cidade, score e situação, ou só o que ainda não está no CRM.
- **Importar para o Bitrix24:** cria a empresa (sem duplicar) e um **negócio** no funil e na etapa escolhidos, com responsável. Funis, etapas e usuários são lidos do portal. Empresas inativas são puladas; as de prioridade A ganham follow-up.
- **Exportar CSV:** a lista enriquecida abre direto no Excel.

Também tem: **follow-up automático** (um “a fazer” para o responsável quando a empresa é de alta prioridade A), botão **Ver no mapa**, aba **Inteligência de CNPJ** dentro do cadastro da empresa (quando instalado como aplicativo), bloqueio de duplicidade pelo CNPJ e tela de **Logs**.

## Requisitos técnicos do desafio

- **Next.js e Node.js:** Next.js 15 (App Router) e Node.js 22.13 ou superior.
- **Banco:** SQLite em `./data/app.db`, pelo módulo nativo `node:sqlite` (sem dependências nativas para compilar).
- **Bitrix24:** API REST oficial. Os campos são criados pelo app e encontrados pelo `XML_ID`, sem IDs fixos de campos, usuários, funis ou portais. Não usa a API do Alaio Vibecode.
- **Cache local:** consultas de CNPJ guardadas por 30 dias (configurável) e lista de empresas do CRM sincronizada no máximo a cada 10 minutos.
- **Configuração inicial:** assistente em 3 passos (conexão, campos do CRM e preferências), mais a aba na empresa no modo aplicativo.
- **Permissões:** aberto pelo Bitrix24, o app usa o token de quem está usando e respeita as permissões dele no CRM. Só administradores alteram a configuração.
- **Segurança:** webhook e tokens criptografados (AES-256-GCM); a chave vem de `APP_SECRET` e nunca fica no código. Sessão em cookie assinado (HttpOnly). A senha de acesso é guardada com scrypt. Há limite de tentativas de login, os logs não guardam tokens e o app só solicita os escopos necessários: `crm` e `user` (mais `task` se o portal não tiver “a fazer” no CRM; `placement` só no modo aplicativo).
- **Interface:** toda em português e responsiva.
- **Erros e logs:** mensagens claras e registro das operações na tela **Logs** e no console.

## Como rodar no computador

Pré-requisito: [Node.js 22.13 ou superior](https://nodejs.org).

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Na primeira vez, o app abre a **Configuração**.

Para produção:

```bash
npm run build
npm start
```

## Conectar ao Bitrix24

### Opção A: webhook de entrada (mais rápido, bom para testar)

1. No Bitrix24, abra **Aplicativos → Recursos para desenvolvedores → Outro → Webhook de entrada**.
2. Marque os escopos **CRM (crm)** e **Usuários (user)** e salve. Se o portal não tiver o “a fazer” do CRM, marque também **Tarefas (task)** para o follow-up automático.
3. Copie a URL do webhook e cole no passo 1 da Configuração, criando uma senha de acesso.

Nesse modo, o app age com as permissões do usuário que criou o webhook.

### Opção B: aplicativo local (recomendado, abre dentro do Bitrix24)

Precisa do app publicado num endereço HTTPS (por exemplo, na Onnira Cloud AI).

1. No Bitrix24, abra **Aplicativos → Recursos para desenvolvedores → Outro → Aplicativo local**.
2. Preencha:
   - **Caminho do manipulador:** `https://SEU-ENDERECO/api/bitrix/app`
   - **Caminho inicial de instalação:** `https://SEU-ENDERECO/api/bitrix/install`
   - **Escopos:** `crm`, `user` e `placement`
   - **Nome no menu:** Inteligência de CNPJ
3. Salve e abra o aplicativo pelo menu. Um administrador conclui a configuração (campos e preferências) e pode adicionar a aba na empresa.

## Variáveis de ambiente

Veja `.env.example`.

| Variável | Para quê |
|---|---|
| `APP_SECRET` | Chave de criptografia dos tokens e das sessões. Se não for definida, é gerada em `./data/.app-secret`. |
| `APP_URL` | Endereço público HTTPS, usado ao registrar a aba na empresa. |
| `DATA_DIR` | Pasta dos dados. O padrão é `./data`. |
| `FRAME_ANCESTORS` | Domínios extras que podem abrir o app em iframe (portais com domínio próprio). |

## Hospedagem (Onnira Cloud AI ou outra)

O app precisa de:

- Node.js 22.13 ou superior;
- `npm install`, `npm run build` e `npm start` (porta padrão 3000, ou a variável `PORT`);
- a variável `APP_SECRET` configurada;
- a pasta `./data` **persistente**, que não pode ser apagada a cada deploy;
- um endereço HTTPS público, para o modo aplicativo.

Há um `Dockerfile` opcional, caso a hospedagem use Docker. Para verificar se o app está no ar, use `GET /api/health`.

## Testes

```bash
npm test          # regras de negócio: CNPJ, fontes, score, criptografia e fluxo completo com Bitrix24 simulado
npm run test:rotas # todas as rotas /api de ponta a ponta, com Bitrix24 e Receita simulados
```

Os testes usam apenas dados fictícios.

## Estrutura

```
app/                 telas (Consultar, Empresas, Empresa, Painel, Logs, Configuração, Entrar) e rotas /api
lib/cnpj.js          validação e formatação (numérico e alfanumérico)
lib/sources.js       BrasilAPI e CNPJ.ws, normalização e cache
lib/intel.js         segmento, porte, score, alertas e abordagem
lib/bitrix.js        cliente REST do Bitrix24 (webhook ou token do usuário)
lib/crm.js           campos, busca por CNPJ, cadastro, atualização e timeline
lib/service.js       regras de negócio
lib/db.js            SQLite (./data)
lib/crypto.js        criptografia, assinatura e senha
lib/log.js           logs sem dados sensíveis
```

## Dados e privacidade

O app usa somente dados públicos do CNPJ (Receita Federal). Os dados das empresas consultadas ficam no CRM do próprio cliente e, em cache, no banco local do app. Nenhum dado é enviado a terceiros além das consultas às bases públicas de CNPJ.
