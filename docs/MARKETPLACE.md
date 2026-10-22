# Textos para publicação no Marketplace da Onnira

Itens exigidos pelo regulamento (seção 11). Revise antes de enviar.

## Descrição curta (até 280 caracteres)

Digite o CNPJ e o Bitrix24 cadastra a empresa com dados da Receita, segmento, porte e um score de potencial comercial. Atualize empresas antigas em lote, evite duplicados e saiba quem priorizar.

(194 caracteres)

## Descrição completa

**Inteligência de CNPJ** transforma o CNPJ em informação pronta para vender.

Basta digitar o CNPJ: o app valida o número, consulta as bases públicas da Receita Federal e mostra razão social, nome fantasia, situação cadastral, data de abertura, atividade principal, endereço, telefone, e-mail e quadro societário. Com um clique, a empresa é cadastrada no CRM do Bitrix24 com todos esses dados preenchidos.

Além do cadastro, o app gera inteligência comercial:

- **Segmento e porte:** identificados pela atividade (CNAE) e pelos dados da Receita.
- **Score de potencial de 0 a 100:** com critérios e pesos que a sua empresa define (porte, tempo de atividade, capital social, contato disponível e segmentos-alvo).
- **Prioridade A, B ou C** e **alertas:** empresa inativa, filial, MEI ou sem contato público.
- **Sugestão de abordagem:** por segmento e porte, com os sócios como prováveis decisores.
- **Comentário automático na timeline** da empresa a cada cadastro ou atualização.
- **Follow-up automático:** quando a empresa é de alta prioridade (A), o responsável recebe um “a fazer” no CRM com prazo configurável.
- **Ver no mapa:** o endereço da Receita abre direto no mapa.
- **Painel** com as melhores oportunidades e a distribuição da base por segmento, porte e estado.

Para prospectar, a área **Prospecção** transforma listas de CNPJs (de feiras, eventos, associações ou planilhas) em oportunidades: o app analisa cada empresa, permite filtrar por CNAE, segmento, porte, região e score, e importa as escolhidas para o Bitrix24 já com negócio no funil, responsável e follow-up. A lista enriquecida também pode ser exportada em CSV.

Para manter o CRM em dia, a tela **Empresas do CRM** mostra quais empresas estão sem CNPJ ou com dados antigos e permite atualizar várias de uma vez. Antes de gravar, o app mostra exatamente o que vai mudar, sem sobrescrever o nome nem o endereço que o seu time já editou. O CNPJ repetido é bloqueado, para evitar empresas duplicadas.

Também funciona com o **novo CNPJ alfanumérico** da Receita Federal.

## Instruções de instalação

1. Instale o aplicativo no seu Bitrix24.
2. Abra **Inteligência de CNPJ** no menu Aplicativos.
3. Um administrador conclui a configuração inicial:
   - **Campos do CRM:** o app cria os campos no cadastro de empresas. Se o portal já tiver um campo de CNPJ, dá para usá-lo.
   - **Preferências:** tempo de cache, nome da empresa (fantasia ou razão social), segmentos-alvo e pesos do score.
   - **Aba na empresa (opcional):** adiciona “Inteligência de CNPJ” dentro de cada empresa do CRM.
4. Pronto: consulte um CNPJ e cadastre a primeira empresa.

Alternativa sem instalação: crie um webhook de entrada (escopos `crm` e `user`) e informe a URL no passo 1 da configuração.

## Suporte técnico

- Responsável: [NOME E EQUIPE — preencher]
- Contato: [E-MAIL OU CANAL DE SUPORTE — preencher]
- Horário de atendimento: [preencher]
- Diagnóstico: a tela **Logs** registra consultas, cadastros, atualizações e erros, para facilitar o atendimento.

## Segurança dos dados

- O app usa somente **dados públicos** do CNPJ, das bases da Receita Federal (BrasilAPI e CNPJ.ws).
- Os dados das empresas são gravados **no CRM do próprio cliente**. O app guarda apenas um cache das consultas e o histórico de operações, no banco do próprio app.
- **Tokens e webhooks são criptografados** (AES-256-GCM) e nunca aparecem em telas ou logs.
- O app solicita apenas os escopos necessários: `crm`, `user` e `placement`.
- **Permissões respeitadas:** cada usuário só vê e altera o que já pode no CRM. Só administradores mudam a configuração.
- A sessão usa cookie assinado e protegido (HttpOnly). No acesso direto, a senha é guardada com hash (scrypt) e há limite de tentativas.
- Nenhum dado do CRM é enviado a terceiros.

## Imagens (até 5)

Sugestão de capturas de tela, com dados fictícios:

1. Consulta de CNPJ com o score e a sugestão de abordagem.
2. Prévia do que muda no CRM antes de atualizar.
3. Empresas do CRM com a atualização em lote em andamento.
4. Painel com as melhores oportunidades.
5. Aba “Inteligência de CNPJ” dentro do cadastro da empresa no Bitrix24.
