# Estudo — Módulo CONTRATO no Linx

Status em PROD: **zerado** (CONTRATO em GUESS e DB_HRG3 = 0 linhas). Infra completa, sem uso.

## 1. Topologia

```
CONTRATO  ───── cabeçalho do contrato (1 linha por contrato)
  │ PK: ID_CONTRATO varchar(25)
  │ FK: COD_CLIFOR, COD_FILIAL, CONTRATO_GRUPO, COD_REPRESENTANTE(_GERENTE)
  │ flag: COMPRA_VENDA char(1)   ← 'C' compra / 'V' venda
  │ NUMERO_CONTRATO varchar(40), DESC_CONTRATO, EMISSAO, OBS, NOME_ARQUIVO
  │
  ├── CONTRATO_ITEM  ── itens do contrato (N por contrato)
  │   │ PK: (ID_CONTRATO, ITEM char(4))
  │   │ FK: CODIGO_ITEM, CONTRATO_TIPO, CONTA_CONTABIL, MOEDA(_REAJUSTE), RATEIO_*
  │   │ Campos-chave:
  │   │   PRECO_UNITARIO numeric(15,5), QTDE numeric(9,3), VALOR_CONTRATO numeric(14,2)
  │   │   DESCONTO/ENCARGO/COMISSAO_ITEM numeric(13,10)
  │   │   DATA_INICIO, DATA_FIM, ULTIMO_REAJUSTE
  │   │   RECORRENCIA tinyint        ← códigos abaixo
  │   │   RECORRENCIA_REAJUSTE tinyint  (periodicidade do reajuste, independente)
  │   │   MOEDA char(6), MOEDA_REAJUSTE char(6)
  │   │   CAMBIO_REAJUSTE numeric(11,6), DATA_CAMBIO_REAJUSTE
  │   │   ACRESCER_IMPOSTO bit
  │   │
  │   └── CONTRATO_FATURAR  ── as parcelas/períodos materializados
  │       PK: (ID_CONTRATO, ITEM, RECORRENCIA_ITEM)
  │       Gerada pela proc LX_CONTRATO_FATURAR — não é gravada manualmente
  │       Campos:
  │         RECORRENCIA_ITEM varchar(8)  ← ex: "R000000", "M01Y2026", "H1M01Y26"
  │         DATA_FATURAMENTO_RELATIVO   ← quando a parcela "nasceu"
  │         NF_SAIDA char(15), SERIE_NF   ← vínculo com NF de SAÍDA emitida
  │         FILIAL, CONDICAO_PGTO, CONTA_CONTABIL, RATEIO_*
  │         QTDE, VALOR_CONTRATO (reajustado se foi o caso)
  │
  ├── CONTRATO_TIPO  ─── classificação (catálogo)
  │   PK: CONTRATO_TIPO char(4)
  │   LX_TIPO_CONTRATO int   ← código Linx
  │   DESC_TIPO_CONTRATO varchar(40)
  │   Em GUESS hoje: ('1', 2, 'FRANQUIA') — única linha
  │
  └── CONTRATO_GRUPO  ── agrupamento (clientes/projetos)

CONTRATOS_DESCONTO  ─── outro módulo, NÃO RELACIONADO (é desconto bancário/borderô).
                        Não usar pra contratos recorrentes.
```

## 2. Códigos de recorrência (descobertos na proc `LX_CONTRATO_FATURAR`)

| Código | Semântica | Mascara RECORRENCIA_ITEM |
|--------|-----------|--------------------------|
| 1 | sem recorrência (avulso) | `R000000` |
| 2 | semanal | `W{semana}Y{ano}` (ex `W01Y2026`) |
| 3 | quinzenal | `H1M{mês}Y{ano}` ou `H2M{mês}Y{ano}` |
| 4 | mensal | (não vi no trecho mas segue padrão) |
| 5 | bimestral | aplicado a cada 2 meses |
| 6 | trimestral | a cada 3 meses |
| 7 | quadrimestral | a cada 4 meses |
| 8 | semestral | a cada 6 meses |
| 9 | anual | a cada 12 meses |

`RECORRENCIA_REAJUSTE` usa o mesmo conjunto numérico mas **aplica ao reajuste**, não à cobrança. Isso é importante: pode ter um contrato com cobrança mensal e reajuste anual.

## 3. Como o motor funciona — `LX_CONTRATO_FATURAR`

Proc com 17 parâmetros. Comportamentos principais:

- **`@retorna=0`**: GRAVA em `CONTRATO_FATURAR` as parcelas que cabem na janela `@Data_Inicio` a `@Data_Fim`. Idempotente: faz `IF NOT EXISTS` antes do INSERT, então rodar duas vezes não duplica.
- **`@retorna=1`**: NÃO persiste — devolve cursor temporário com fluxo de caixa projetado. Usado pra simulação/preview (chamado por `LX_CTB_FLUXO_CAIXA`).
- **`@Xreajustar=1|3`**: aplica reajuste se chegou no ciclo definido por `RECORRENCIA_REAJUSTE`. Atualiza `ULTIMO_REAJUSTE` e `PRECO_UNITARIO`. Pode reajustar:
  - por câmbio (se moeda diferente da base) → usa `MOEDA_REAJUSTE` + `CAMBIO_REAJUSTE`
  - por valor fixo definido em `PRECO_UNITARIO` (sem variação)

A proc **só funciona pra contratos com `CONTRATO_TIPO.LX_TIPO_CONTRATO=1`** (linha 143 do SQL). Tipos diferentes são ignorados. **Em GUESS hoje o único tipo cadastrado é `LX_TIPO_CONTRATO=2 (FRANQUIA)`** — ou seja, a proc não roda em nada hoje porque não existe tipo 1.

A geração das parcelas usa **`COND_ATAC_PGTOS`** pra calcular os vencimentos: cada condição de pagamento (ex: "030", "060/090", "30/60/90") tem 12 colunas `PORCENTAGEM_N` + `PARCELA_N` que definem como o valor total é dividido. A condição de pagamento dirige o cronograma.

## 4. Vínculo com o resto do Linx — o que CHEGA em CONTRATO_*

```
CRM_HORAS_TIPO.CONTRATO_TIPO    → CONTRATO_TIPO.CONTRATO_TIPO
CRM_TAREFA_HORAS.ID_CONTRATO    → CONTRATO_ITEM.ID_CONTRATO  (com ITEM_CONTRATO)
```

**Apenas CRM referencia CONTRATO_*.** Não há FK de:
- `CTB_A_PAGAR_PARCELA` (contas a pagar) → CONTRATO
- `COMPRAS` (pedidos) → CONTRATO
- `ENTRADAS` (NF de entrada) → CONTRATO

**Implicação grande**: o módulo CONTRATO no Linx **foi desenhado pra venda/faturamento e prestação de serviço (CRM)**, NÃO pra compra. Os FKs de `CONTRATO_FATURAR` apontam pra `FATURAMENTO_ITEM` (saída) — não pra `ENTRADAS_NF`.

## 5. Sequencial

- `CONTRATO.CODIGO_CONTRATO` (tamanho 6, atual `000008`) — existe mas só foi usado 8 vezes em toda a história. Provavelmente teste.
- `LX_SEQUENCIAL('CONTRATO.CODIGO_CONTRATO')` está disponível pra gerar IDs.

## 6. Triggers

**Nenhuma.** Significa: nenhuma magia automática nas tabelas CONTRATO_*. Tudo flui via procedure (LX_CONTRATO_FATURAR) e essa proc só faz alguma coisa se for chamada — não há job/agente do Linx que dispara sozinho.

## 7. Análise crítica — o que serve e o que não serve pro P2P

### ✅ Serve direto (reaproveitável)

| Item | Por quê |
|------|---------|
| `CONTRATO` (cabeçalho) | Cabe perfeitamente: fornecedor, filial, descrição, vigência implícita via itens |
| `CONTRATO_ITEM` | Tem tudo que precisamos: preço, qtd, datas, MOEDA, recorrência, reajuste, rateio, conta contábil |
| `CONTRATO.COMPRA_VENDA='C'` | Flag pronta pra distinguir contrato de compra |
| Códigos de recorrência (1-9) | Padronizados e cobrem todos os casos da coordenação |
| `COND_ATAC_PGTOS` (condição de pagamento) | Já usado em outros pontos do Linx — define vencimentos das parcelas |
| `MOEDA`, `MOEDA_REAJUSTE`, `CAMBIO_REAJUSTE` | Cobre contratos em USD/EUR reajustados por câmbio |
| Sequencial `CONTRATO.CODIGO_CONTRATO` | Já existe no banco |

### ⚠️ Cuidado / adaptação necessária

| Item | Problema | Saída |
|------|----------|-------|
| `LX_CONTRATO_FATURAR` (motor) | Só roda pra `LX_TIPO_CONTRATO=1` e gera `CONTRATO_FATURAR.NF_SAIDA` (venda) | **Não usar a proc**. Reimplementar a lógica de geração de parcelas no P2P (controlamos tudo, sem dependência) |
| `CONTRATO_FATURAR` | FKs apontam pra `FATURAMENTO_ITEM` (NF de saída) — não serve pra compra | Não usar essa tabela. Manter as parcelas só do lado P2P + espelho em `CTB_A_PAGAR_PARCELA` |
| `CONTRATO_TIPO` | Tem 1 linha hoje (FRANQUIA, tipo 2) | Cadastrar tipo novo: ex. `('CMP1', 1, 'CONTRATO DE COMPRA P2P')` em ambos os bancos |
| Sem FK CONTRATO → A_PAGAR | Não há vínculo nativo | Criar tabela P2P de "parcela de contrato" e usar `CTB_A_PAGAR_FATURA.PROVISAO=1` + `OBS` pra rastreio cruzado |

### ❌ Não serve

- `CONTRATOS_DESCONTO` — outro módulo (desconto bancário). Nome parecido, função diferente.

## 8. Proposta de arquitetura revisada (após estudo)

```
P2P (autoridade do contrato)
└── Contract
    ├── companyId, fornecedor, filial, descrição, anexo PDF
    ├── tipo: FIXO | VARIÁVEL | MEDIÇÃO
    ├── vigência (start, end?), recorrência (1-9 igual Linx)
    ├── valor_mensal_base, condição_pgto, rateio
    ├── reajuste: índice IPCA/IGP-M ou câmbio, mês_aniversário
    ├── tolerância de variação (%)
    ├── status: RASCUNHO → APROVADO → ATIVO → ENCERRADO
    └── ContractInstallment (geradas pelo cron P2P)
        ├── competência YYYY-MM, vencimento, valor_previsto
        ├── status: PROVISIONADA → AGUARDANDO_NF → REALIZADA
        └── linx_lancamento (quando vira ITP)

Linx (espelho contábil)
├── CONTRATO + CONTRATO_ITEM    ← cadastro do contrato (espelho)
│   COMPRA_VENDA='C', CONTRATO_TIPO=<nosso tipo>, RECORRENCIA=4 (mensal)
│
└── CTB_A_PAGAR_FATURA.PROVISAO=1 + parcelas em CTB_A_PAGAR_PARCELA
    ↑ provisão mensal lançada pelo P2P
    OBS: rastreio "P2P-CT-{numero}-PARCELA-{NN}"
    Quando NF chega:
      UPDATE CTB_A_PAGAR_FATURA SET PROVISAO=0, NUMERO_ENTRADA=...
      ou substitui pelo lançamento definitivo (PR → NF, padrão TOTVS)
```

**Por que ainda gravar em CONTRATO + CONTRATO_ITEM no Linx mesmo sem usar `LX_CONTRATO_FATURAR`?**

1. **Rastreabilidade contábil**: a coordenação fiscal/contábil consegue auditar o contrato no Linx (sem precisar abrir o P2P)
2. **Não fica dado órfão**: as parcelas em `CTB_A_PAGAR_PARCELA` apontam pra um contrato existente no Linx (via OBS)
3. **Futuro**: se a empresa decidir usar relatórios nativos do Linx sobre contratos, já estão lá

## 9. Pontos a confirmar com a coordenação ANTES de implementar

| Tópico | Pergunta concreta |
|--------|-------------------|
| Tipo de contrato | "Vamos cadastrar um tipo novo no Linx (`CMP1=COMPRA P2P`, `LX_TIPO_CONTRATO=1`) — tudo bem ou já existe convenção?" |
| Provisão em CTB_A_PAGAR | "O fluxo de provisão (`CTB_A_PAGAR_FATURA.PROVISAO=1`) que vira definitivo quando a NF chega — vocês usam hoje? Conhecem a mecânica?" |
| Vínculo NF → Contrato | "Hoje vocês têm como amarrar uma NF de entrada a um contrato manualmente? Onde aparece esse vínculo?" |
| Reajuste por índice | "Qual índice de reajuste é mais comum nos contratos de vocês? IPCA / IGP-M / IPC-A / outro?" |
| Variação tolerada | "Qual é a tolerância padrão de variação de valor mensal aceita sem reaprovação? 5%? 10%? Caso a caso?" |
| Renovação | "Quando o contrato vence (data_fim) e a relação continua — renova automaticamente? Aprovação nova? Cobra aditivo?" |
| Aditivo contratual | "Como vocês tratam aditivos (mudança de valor/prazo) hoje? Cria contrato novo? Anexa documento?" |
| Encerramento antecipado | "Em rescisão: o que acontece com as parcelas futuras já provisionadas?" |
| Quem opera | "Quem cria o contrato no P2P? Comprador? Solicitante? Financeiro?" |
| Onde aparece | "Solicitante consegue criar requisições 'puxando' do contrato (sem cotar)?" |

## 10. Estimativa de esforço

| Item | Esforço |
|------|---------|
| Schema P2P (Contract + ContractInstallment) | 1 dia |
| CRUD + lista + detalhe + anexo de contrato | 3 dias |
| Fluxo de aprovação (reaproveita cadeia existente) | 1 dia |
| Cron de geração de parcelas + cálculo de reajuste | 2 dias |
| Integração Linx (espelho em CONTRATO + parcelas em CTB_A_PAGAR provisórias) | 3 dias |
| Vinculação NF → provisão definitiva | 2 dias |
| Tela de "exceções" (variação fora da tolerância) | 1 dia |
| Migração da recorrência antiga (botão "converter em contrato") | 1 dia |
| Testes E2E + alinhamento com coordenação | 2 dias |
| **Total** | **~16 dias úteis (3 sprints)** |

---

## Decisão pendente

**Vamos usar o módulo CONTRATO do Linx como espelho** (cadastrar contratos lá pra rastreabilidade contábil) **ou tratar tudo do lado P2P** (só `CTB_A_PAGAR_FATURA.PROVISAO=1` apontando pro contrato via OBS)?

Recomendo **espelhar** porque:
- A coordenação contábil/fiscal pode auditar no Linx que já conhece
- Custo de implementação é baixo (mais 1 INSERT por contrato + 1 por item, comparável ao SV)
- Mantém o Linx como source-of-truth de "o que a empresa contratou"
- Sem dependência da proc `LX_CONTRATO_FATURAR` (que é só pra venda)
