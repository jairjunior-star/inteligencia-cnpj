# Inteligência de CNPJ: materiais para o Marketplace da Onnira

Itens exigidos pelo regulamento para a publicação.

## Descrição curta (até 280 caracteres)

Digite o CNPJ e o Bitrix24 cadastra a empresa com dados da Receita, segmento, porte e score de potencial. Prospecte listas por CNAE com negócio no funil, atualize empresas antigas em lote e evite duplicados.

## Descrição completa

**Inteligência de CNPJ** transforma o CNPJ em informação pronta para vender, direto no CRM do Bitrix24.

Basta digitar o CNPJ: o app valida o número (inclusive o novo CNPJ alfanumérico), consulta as bases públicas da Receita Federal e mostra razão social, nome fantasia, situação cadastral, data de abertura, atividade principal (CNAE), endereço, telefone, e-mail e quadro societário. Com um clique, a empresa é cadastrada no CRM do Bitrix24 com todos esses dados preenchidos.

Além do cadastro, o app gera inteligência comercial:

- **Segmento e porte:** identificados pela atividade (CNAE) e pelos dados da Receita.
- **Score de potencial de 0 a 100:** com critérios e pesos que a sua empresa define (porte, tempo de atividade, capital social, contato disponível e segmentos-alvo).
- **Prioridade A, B ou C** e **alertas:** empresa inativa, filial, MEI ou sem contato público.
- **Sugestão de abordagem:** por segmento e porte, com os sócios como prováveis decisores, e um botão para copiar tudo e usar na ligação ou no e-mail.
- **Contato em um clique:** WhatsApp, e-mail, endereço no mapa e pesquisa da empresa no Google e no LinkedIn.
- **Comentário automático na timeline** da empresa a cada cadastro ou atualização.
- **Follow-up automático:** quando a empresa é de alta prioridade (A), o responsável recebe um “a fazer” no CRM, com prazo configurável.
- **Painel** com as melhores oportunidades e a distribuição da base por prioridade, segmento, porte e estado.

**Prospecção:** transforme listas de CNPJs (de feiras, eventos, associações ou planilhas) em oportunidades. Cole os CNPJs ou envie um CSV (há um modelo para baixar): o app analisa cada empresa, permite filtrar por CNAE, segmento, porte, região e score, e importa as escolhidas para o Bitrix24 já com negócio no funil, etapa, responsável e follow-up. A lista enriquecida também pode ser exportada em CSV.

**CRM em dia:** a tela Empresas do CRM mostra quais empresas estão sem CNPJ ou com dados antigos e permite atualizar várias de uma vez. Antes de gravar, o app mostra exatamente o que vai mudar, sem sobrescrever o nome nem o endereço que o seu time já editou.

**Sem duplicados:** antes de cadastrar ou importar, o app procura o CNPJ no Bitrix24 e não cria a empresa de novo se ela já existir.

## Instruções de instalação

O app é configurado por um administrador do Bitrix24, em três passos. Leva cerca de 5 minutos.

1. **Crie um webhook de entrada no seu Bitrix24.** Acesse *Aplicativos → Recursos para desenvolvedores → Outro → Webhook de entrada*. Marque as permissões **CRM (crm)** e **Usuários (user)**. Se o seu portal não tiver “a fazer” no CRM, marque também **Tarefas (task)**. Salve e copie a URL gerada. Ela funciona como uma senha: não compartilhe.
2. **Abra o Inteligência de CNPJ** e siga o assistente de configuração:
   - **Conexão:** cole a URL do webhook, crie a senha de acesso ao app e clique em testar.
   - **Campos do CRM:** o app cria no cadastro de empresas os campos de que precisa (CNPJ, segmento, porte, score e outros). Se o portal já tiver um campo de CNPJ, você pode usá-lo.
   - **Preferências:** tempo de cache, nome da empresa (fantasia ou razão social), segmentos-alvo, pesos do score e follow-up automático.
3. **Pronto:** consulte um CNPJ e cadastre a primeira empresa.

O app age com as permissões do usuário que criou o webhook. Para usar com outro portal, basta repetir a configuração com o webhook daquele portal: nenhum ID ou campo é fixo no código.

## Suporte técnico

- Responsável: Jair Junior, Br24
- Contato: jair.junior@br24.io
- Horário de atendimento: segunda a sexta, das 9h às 18h (horário de Brasília)
- Diagnóstico: a tela **Logs** registra consultas, cadastros, atualizações e erros, para agilizar o atendimento. Ao abrir um chamado, envie o horário aproximado do problema e o CNPJ envolvido.

## Segurança dos dados

- **Somente dados públicos:** o app consulta apenas dados cadastrais públicos de empresas, das bases da Receita Federal (BrasilAPI e CNPJ.ws). Não usa serviços pagos.
- **Os dados ficam no seu CRM:** as informações das empresas são gravadas no Bitrix24 do próprio cliente. O app guarda apenas um cache das consultas e o histórico de operações, no banco do próprio app. Nenhum dado do CRM é enviado a terceiros.
- **Webhook protegido:** a URL do webhook é criptografada (AES-256-GCM), com a chave fora do código, e nunca aparece em telas ou logs.
- **Integração oficial:** usa somente a API REST oficial do Bitrix24, com o webhook do próprio cliente, e pede apenas as permissões necessárias (`crm` e `user`; `task` só se o portal não tiver “a fazer” no CRM).
- **Acesso protegido:** a senha de acesso é guardada com hash (scrypt), a sessão usa cookie assinado e protegido (HttpOnly) e há limite de tentativas de login. Só administradores alteram a configuração.
- **Rastreabilidade:** todas as operações e erros ficam registrados em log, sem tokens nem dados sensíveis.

## Imagens

Capturas com dados fictícios (pasta `imagens/`, 1920×1200):

1. `1-consulta-score.png`: consulta de CNPJ com score, prioridade, segmento e porte.
2. `2-abordagem-contato.png`: como o score foi calculado e a sugestão de abordagem.
3. `3-prospeccao-lista.png`: lista de prospecção com filtros por CNAE, segmento, porte e região.
4. `4-previa-atualizacao.png`: prévia do que muda no CRM antes de atualizar.
5. `5-painel.png`: painel com prioridades, segmentos e porte da base.
