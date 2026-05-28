# Qive (Arquivei) API — v1.97.0

## Visão geral

- **Host produção:** https://api.arquivei.com.br
- **Host sandbox:** https://sandbox-api.arquivei.com.br
- **Schemas:** https

## Autenticação

Todas as requisições exigem 2 headers de API key:

| Header | Tipo | Obrigatório |
|--------|------|-------------|
| x-api-id | apiKey | sim |
| x-api-key | apiKey | sim |
| x-api-permission-key | apiKey | não (opcional, para escopos restritos) |

Em PROD as chaves vivem em backend/.env: QIVE_API_ID e QIVE_API_KEY

## Endpoints relevantes para o P2P

Os 50+ endpoints cobrem NFe, CTe, NFSe, NFCe, Invoices, Utilities, OCR e LATAM. Listamos abaixo os que importam para o fluxo de receber NF e conciliar com pedido do Linx.

### GET /v1/company

**Busca todos os CNPJs da conta autenticada.**

Busca todos os CNPJs da conta autenticada

#### Parâmetros

Sem parâmetros.

#### Respostas

- **200** — Successful fetch
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### POST /v2/dfe/nfe

**Lista as NFes da conta com base nos filtros aplicados**

Este endpoint permite buscar todas as NFes da conta, retornando os dados conforme a projeção solicitada, além de permitir novos filtros como chave de acesso, CNPJ do emitente, transportador e destinatário, status da NFe, entre outros.

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| X-API-ID | header | string | sim | API ID usado para autenticação. |
| X-API-KEY | header | string | sim | API KEY usado para autenticação. |
| X-Use-ApiGateway | header | string | sim | Este header indica que a request será roteada pelo API Gateway da Qive e o valor deve ser passado como `always`. |
| Body | body | object | não | A API busca NFes através dos seguintes filtros, que devem ser enviados no corpo da requisição:  ### Filtros (`Filters`):  - **`CreatedAt`** (Objeto com `From` e `To`) – Filtra os documentos pelo intervalo de data/hora de criação do registro no sistem |

#### Respostas

- **200** — HTTPNfeListResponseV2 contém a resposta da chamada para a API de listagem de NFes.
- **default** — HTTPNfeResponseErrorV2 é retornado em caso de erro.

### GET /v1/nfe/{role}

**Busca XMLs de NFes recebidas pelos CNPJs de sua conta**

Este endpoint é responsável por buscar XMLs de NFEs recebidas, utilizando alguns filtros.

- Nossa API utiliza o 'cursor' como parâmetro para paginação. Para cada documento é atribuído um cursor que não muda com o tempo, sendo possível fazer o reprocessamento dos documentos resetando o cursor para 0.

- O campo 'limit' define a quantidade de documentos retornados na resposta, sendo máximo 50. O padrão, caso não seja enviado, é sempre 50.

- Campos created_at[from] e created_at[to] definem um range de buscar por datas em que a nota entrou na API - estes campos não se referem à data de emissão da nota e sim a sua criação na Qive.

- Campo cnpj[] - utilizado para filtrar pelos CNPJs que são 'owner' do documento.

- Campo access_key[] - permite filtrar por um conjunto de chaves de acesso.

- Campo format_type - permite retornar os dados do documento em xml ou json.

- Compo filter - permite realizar uma busca utilizando um filtro personalizado, com valores inseridos através do endpoint de PUT /v1/nfe/received/{property}.

 **Example:**

 `GET /nfe/received?filter=(= processed false)&access_key[]=44charkey&limit=50`

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| role | path | string | sim | O nome da role. Valores possíves: **received**, **emitted**, **transporter**, **authorized**. ex: **/v1/nfe/received** |
| limit | query | integer | não | Quantidade de XMLs retornados na resposta. Máximo 50 documentos. Caso não seja enviado, serão retornados 50 documentos. |
| cursor | query | integer | não | O cursor define a posição a partir da qual serão buscados os documentos. Este valor será retorno no campo data.page.next após uma requisição bem sucedida, com o valor do próximo cursor a ser buscado. |
| access_key | query | array | não | Filtrar uma lista de chaves de acesso. Exemplo de uso deste filtro: v1/nfe/received?access_key[]=44charKey |
| cnpj | query | array | não | Filtrar por uma lista de CNPJs ou CPFs. Examplo de uso deste filtro: v1/nfe/received?cnpj[]=34174654000153&cnpj[]=34174654000215 |
| filter | query | string | não | Filtrar pela presença de um valor para uma custom property, de acordo com a nossa Query Language. Este filtro utiliza uma linguagem pré-fixada, onde os operadores são colocados antes dos operandos. Operadores disponíveis:   - **=** - Exemplo: filter= |
| created_at[from] | query | string | não | Filtrar por datas de criação da nota na API. Este campo é obrigatório quando o campo created_at[to] for utilizado. Examplo de uso = /v1/nfe/received?created_at[from]=2019-09-12 15:30:25&created_at[to]=2019-09-15 15:30:25. <br> Pode ser utilizado date |
| created_at[to] | query | string | não | Filtrar por datas de criação da nota na API. Este campo é obrigatório quando o campo created_at[from] for utilizado. Examplo de uso = /v1/nfe/received?created_at[from]=2019-09-12 15:30:25&created_at[to]=2019-09-15 15:30:25. <br> Pode ser utilizado da |
| format_type | query | string | não | Formata a resposta em JSON ou XML |

#### Respostas

- **200** — Successful fetch
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### PUT /v1/nfe/{role}/{property}

**Adiciona ou atualiza uma Property customizada para uma NFe Recebida.**

Através deste endpoint é possível adicionar ou atualizar o valor de uma Property customizada para um determinado documento.

A property funciona como um par chave-valor para um documento, permitindo que o usuário indique um valor qualquer para a property que deseja.

Por padrão sua conta já possui uma property com chave 'status', sendo possível atribuir valores para esta propery para cada documento.

Estes valores podem depois ser utilizados no parâmetro 'filter' do endpoint de GET.

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| role | path | string | sim | O nome da role. Valores possíves: **received**, **emitted**, **transporter**, **authorized**. ex: **/v1/nfe/received/status** |
| property | path | string | sim | O nome da chave customizada. Exemplo: status - o endpoint ficaria **/v1/nfe/received/status** |
| data | body | object | sim | A chave de acesso e o valor que será adicionado ou atualizado para a property. É possível atualizar mais de um valor na mesma requisição, para chaves de acesso diferentes. |

#### Respostas

- **200** — Successful update
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### GET /v2/nfe/manifest

**Busca a manifestação de uma NFe.**

Este endpoint é responsável por buscar a manifestação mais recente realizada em uma NFe. Esta manifestação só ficará disponível caso tenha sido realizada através da plataforma Qive ou da API.

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| access_key | query | array | sim | Filtra por uma lista de chaves de acesso. Exemplo: `v1/nfe/manifest?access_key[]=44charKey` |
| origin | query | string | não | Filtra por uma lista de origens da manifestação. As origens podem ser **app** (manifestações realizadas pela Plataforma) ou **api** (manifestações realizadas pela API). Exemplo: `v2/nfe/manifest?access_key[]=44charKey&origin=api` |

#### Respostas

- **200** — Successful manifestation fetch
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### GET /v1/nfe/manifest

**Busca a manifestação de uma NFe.**

Este endpoint é responsável por buscar a manifestação mais recente realizada em uma NFe. Esta manifestação só ficará disponível caso tenha sido realizada através da plataforma Qive ou da API.

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| access_key | query | array | sim | Filtra por uma lista de chaves de acesso. Exemplo: `v1/nfe/manifest?access_key[]=44charKey` |

#### Respostas

- **200** — Successful fetch
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### POST /v1/nfe/manifest

**Realiza a manifestação de uma ou mais NFes, de forma assíncrona.**

Este endpoint é responsável por realizar a manifestação de uma lista de NFes.

O endpoint retorna um **request_id** que deve ser utilizado para verificar o status da manifestação.

* * *

Lista de códigos para manifestação:



  *   **Confirmação**: 210200

  *   **Ciencia**: 210210

  *   **Desconhecimento**: 210220

  *   **Não Realizada**: 210240



Mais informações sobre o processo de manifestação do destinatário pode ser encontrado no site da Secretaria da Fazenda: [nfe.fazenda.gov.br]("http://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=bUBJ/PmtKQo=")

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| body | body | object | sim | `access_key` - chave de acesso da NFe, contendo 44 caracteres. `code` - código de 6 dígitos da manifestação a ser realizada - verificar lista acima `justification` - string com a justificava para a manifestação. Apenas necessário quando o code utiliz |

#### Respostas

- **200** — Successful manifestation request
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### POST /v1/nfe/manifest/sync

**Realiza a manifestação de uma NFe de forma síncrona (sync)**

Este endpoint é responsável por realizar a manifestação de uma NFes.

O endpoint retorna a resposta direto da SEFAZ com o status da manifestação.

* * *

Lista de códigos para manifestação:



  *   **Confirmação**: 210200

  *   **Ciencia**: 210210

  *   **Desconhecimento**: 210220

  *   **Não Realizada**: 210240



Mais informações sobre o processo de manifestação do destinatário pode ser encontrado no site da Secretaria da Fazenda: [nfe.fazenda.gov.br]("http://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=bUBJ/PmtKQo=")

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| body | body | object | sim | `access_key` - chave de acesso da NFe, contendo 44 caracteres. `code` - código de 6 dígitos da manifestação a ser realizada - verificar lista acima `justification` - string com a justificava para a manifestação. Apenas necessário quando o code utiliz |

#### Respostas

- **200** — Successful manifestation request
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### GET /v1/nfe/manifest/status

**Busca o status de um pedido de manifestação de NFe realizado através do endpoint POST /v1/nfe/manifest**

Este endpoint é responsável por retornar os status das manifestações requisitadas através do endpoint anteriormente mencionado.

Deve ser utilizado o **request_id** retornado anteriormente ou uma chave de acesso.

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| access_key | query | array | não | Filtra por uma lista de chaves de acesso. Exemplo: `v1/nfe/manifest?access_key[]=44charKey` |
| request_id | query | array | não | Filtra por uma lista de request_ids. Exemplo: `v1/nfe/manifest/status?request_id[]=64charId` |

#### Respostas

- **200** — Successful manifestation status fetch
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### GET /v2/nfe/events

**Busca os XMLs de todos os eventos de uma NFe**

Este endpoint é responsável por realizar a busca dos XMLs de todos os eventos de uma NFe, retornados em base64.

Todos os Eventos de uma NFe disponibilizados pela SEFAZ são retornados, sendo possível buscar apenas uma chave de acesso por vez.

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| access_key | query | string | sim | A chave de acesso de uma NFe. Exemplo: `/v2/nfe/events?access_key=44charKey` |
| type | query | array | não | Um Array com os tipos de eventos a serem filtrados. Cada tipo de evento é uma string de 6 dígitos string, exemplo: `/v2/nfe/events?type[]=110111&type[]=110110`' Existem diversos tipos de evento, sendo o principal utilizado tipo **110111**, para Cance |

#### Respostas

- **200** — Successful fetch
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### GET /v1/nfe/danfe

**Busca o Documento Auxiliar (DANFe) de uma NFe, retornando um PDF em base64**

Este endpoint é responsável por realizar a busca do Documento Auxiliar (DANFe) de uma NFe, retornando um PDF em base64,

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| access_key | query | string | sim | A chave de acesso de uma NFe. Exemplo: `/v1/nfe/danfe?access_key=44charKey` |

#### Respostas

- **200** — Successful fetch
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **422** — Unprocessable Content
- **429** — Too many requests
- **500** — Internal Server Error

### POST /v1/dfe/flagerp

**Upload de metadados de DFes para flag ERP**

Essa API recebe os metadados enviados através de uma chave e valor ('key': 'value'), o tipo de documento (NFE, NFSE, CTE, CTEOS, CFESAT e NFCE) e o id da nota.

#### Parâmetros

| Nome | Em | Tipo | Obrigatório | Descrição |
|------|----|------|-------------|-----------|
| X-Use-ApiGateway | header | string | sim | Este header indica que a request será roteada pelo API Gateway da Qive e o valor deve ser passado como `always`. |
| body | body | object | sim | Corpo da requisição. Deve conter as seguintes informações: - `doc_type`: Tipo do documento (NFE, NFSE, CTE, CTEOS, CFESAT, NFCE). Este campo deve indicar o tipo de documento a ser processado. - `id`: Identificador único do documento:   - No caso de N |

#### Respostas

- **200** — Operação de upload concluída com sucesso
- **400** — Bad request
- **401** — Unauthorized
- **403** — Forbidden
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests
- **500** — Internal Server Error

### GET /v1/property

**Retorna todas as chaves de properties disponíveis para uso nos endpoints específicos.**

Este endpoint é responável por retornar todas as chaves de properties disponíveis para conta, para uso nos endpoints de PUT de property.

 **Example:**

 `GET /v1/property`

#### Parâmetros

Sem parâmetros.

#### Respostas

- **200** — Successful fetch
- **400** — Bad request
- **401** — Unauthorized
- **404** — Not found
- **405** — Method not allowed
- **429** — Too many requests

---

## Linx — entrada de NF e ligação com o pedido

A baixa do saldo de um PC no Linx (mover `QTDE_ENTREGAR → QTDE_ENTREGUE` em `COMPRAS_CONSUMIVEL`) NÃO vem de um cron P2P → Linx; vem da **entrada da NF no Linx**, feita hoje pela rotina manual do fiscal/financeiro nas telas nativas.

### Tabelas do Linx envolvidas

- **`COMPRAS`** — cabeçalho do pedido (`PEDIDO` char(8), `FORNECEDOR`, `STATUS_APROVACAO`, `STATUS_COMPRA`, `ORIGEM_DA_COMPRA` ← onde o P2P grava o número da OC).
- **`COMPRAS_CONSUMIVEL`** — itens de compra do tipo consumível/serviço, com `QTDE_ORIGINAL`, `QTDE_ENTREGUE`, `QTDE_CANCEL_PEDIDO`, `QTDE_ENTREGAR`. A baixa entra por aqui.
- **`SS_ITEM_FISCAL_FORNECEDOR`** — vínculo item-fornecedor (`CLIFOR`, `CODIGO_ITEM`). Bloqueia entrada de NF se o item não estiver vinculado ao fornecedor.
- **`NOTAS_FISCAIS_ENTRADA`** + itens — registro da NF; o lançamento dispara o incremento de `QTDE_ENTREGUE` em `COMPRAS_CONSUMIVEL`.
- **`CTB_A_PAGAR_FATURA` / `CTB_A_PAGAR_PARCELA`** — financeiro: a entrada da NF gera o título a pagar.

### Como o Linx amarra a NF ao pedido (hoje)

Manual: operador do fiscal/financeiro abre a tela "Entrada de NF" no Linx, informa `PEDIDO` (ou `FORNECEDOR + CHAVE_NFE`) e o Linx valida itens contra `COMPRAS_CONSUMIVEL`. Se o item da NF não bater com nenhum do pedido, ou o vínculo `SS_ITEM_FISCAL_FORNECEDOR` não existir, a trigger `LXI_NOTAS_FISCAIS_ENTRADA` (ou equivalente) impede o lançamento.

A coluna `COMPRAS.ORIGEM_DA_COMPRA` carrega o número da OC do P2P (ex.: `OC-2026-000024`) — útil pra cruzar P2P ↔ Linx em rotinas de conciliação, mas **não é usado pelo Linx para amarrar NF ao pedido**.

---

## Plano de integração — Qive ↔ P2P ↔ Linx

### Premissa

Hoje a entrada da NF no Linx é manual. O objetivo é usar a Qive como **fonte de entrada de NF** para automatizar (ou semi-automatizar) o processo.

### Fluxo proposto

1. **NF chega na Qive** (recebida via SEFAZ pelo CNPJ da Guess/HRG3).
2. **Cron P2P consome Qive** a cada N minutos:
   - Chama `GET /v1/nfe/received?cursor=<último>` paginado.
   - Cada NFe retornada vira registro `fiscal_documents` no P2P. Status inicial: `PENDING_MATCH`.
3. **Matching automático:**
   - Pegamos `fornecedor` (CNPJ) e a soma dos valores dos itens.
   - Procuramos PC do P2P do mesmo fornecedor com `status` em `INTEGRATED` e diferença pequena no total.
   - Match único → `MATCHED`; múltiplos candidatos → `PENDING_REVIEW`.
4. **Operador fiscal revisa** as NFs em `PENDING_REVIEW` e confirma o match.
5. **Marcar como processada na Qive:**
   - `POST /v1/dfe/flagerp` para sinalizar que a NF entrou no ERP.
   - `PUT /v1/nfe/received/property` para gravar property `p2p_pedido=OC-2026-000024` (filtrável depois).
6. **(Futuro) Lançar a NF no Linx automaticamente** — depois que o matching estiver robusto: o P2P insere em `NOTAS_FISCAIS_ENTRADA + ITEM`, disparando a baixa de `QTDE_ENTREGUE`.

### Endpoints da Qive que vamos usar

| Endpoint | Quando |
|----------|--------|
| `GET /v1/nfe/received` | Cron do P2P puxa novas NFes recebidas |
| `GET /v1/company` | Bootstrap — listar CNPJs cadastrados na conta Qive |
| `GET /v1/property` | Listar properties customizadas existentes |
| `PUT /v1/nfe/received/{property}` | Marcar NF com o número da OC do P2P |
| `POST /v1/dfe/flagerp` | Sinalizar pra Qive que a NF entrou no ERP |
| `POST /v1/nfe/manifest/sync` | Manifestar (acusar recebimento ou rejeitar) |
| `GET /v1/nfe/danfe` | DANFe em PDF (anexar à NF do P2P pra UI) |

### O que precisamos criar no P2P

- Migration: tabela `fiscal_documents` (`access_key`, `supplier_cnpj`, `numero`, `serie`, `valor_total`, `emissao`, `status`, `purchase_order_id?`, `xml_url`, `raw_payload jsonb`).
- Module `fiscal-documents` (substitui o stub atual).
- Service `qive-client` em `integration/` — wrapper REST com retry, paginação por cursor, rate limit.
- Cron `fiscal-documents-sync` — a cada N min puxa novas NFes da Qive.
- Tela admin pra ver as NFes pending review e fazer o match manual.

### Decisões pendentes

1. **Match automático ou só semi-automático?** Match único confiável entra direto, ou tudo passa por revisão?
2. **Tolerância de valor** pro match: 1%? 5%? Default 0?
3. **Quem manifesta a NF?** P2P automático (ao receber) ou o fiscal aprova explicitamente?
4. **Lançamento no Linx automático ou manual?** No MVP propomos manter manual no Linx. Confirmar.
