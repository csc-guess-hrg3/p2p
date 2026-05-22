-- ============================================================
-- Views de integração ERP — criadas no P2P_DB
-- Unem as duas empresas (GUESS_PRODUCAO + DB_HRG3) via cross-database
-- Camada anti-corrupção: o P2P só enxerga estas views, nunca o schema do ERP
-- Reaplicar: rodar este arquivo via apply-erp-views.js
-- ============================================================

-- ---------- FILIAIS ----------
-- Dados cadastrais (razão social, IE, endereço) vêm de CADASTRO_CLI_FOR,
-- ligado por FILIAIS.CLIFOR. Filial inativa = marcada inativa no cadastro
-- mestre ou com data de fechamento preenchida (RN-FIL-02).
CREATE OR ALTER VIEW dbo.v_p2p_branches AS
SELECT 'GUESS' AS empresa, RTRIM(f.COD_FILIAL) AS codigo, RTRIM(f.FILIAL) AS nome,
       RTRIM(c.RAZAO_SOCIAL) AS razao_social, RTRIM(f.CGC_CPF) AS cnpj,
       RTRIM(c.RG_IE) AS ie, RTRIM(c.ENDERECO) AS logradouro,
       RTRIM(c.NUMERO) AS numero, RTRIM(c.BAIRRO) AS bairro,
       RTRIM(c.CIDADE) AS cidade, RTRIM(c.UF) AS uf, RTRIM(c.CEP) AS cep,
       RTRIM(f.TIPO_FILIAL) AS tipo,
       CAST(CASE WHEN c.INATIVO = 1 OR f.DATA_FECHAMENTO IS NOT NULL
                 THEN 1 ELSE 0 END AS BIT) AS inativo
FROM GUESS_PRODUCAO.dbo.FILIAIS f
LEFT JOIN GUESS_PRODUCAO.dbo.CADASTRO_CLI_FOR c ON c.CLIFOR = f.CLIFOR
UNION ALL
SELECT 'HERING', RTRIM(f.COD_FILIAL), RTRIM(f.FILIAL), RTRIM(c.RAZAO_SOCIAL),
       RTRIM(f.CGC_CPF), RTRIM(c.RG_IE), RTRIM(c.ENDERECO), RTRIM(c.NUMERO),
       RTRIM(c.BAIRRO), RTRIM(c.CIDADE), RTRIM(c.UF), RTRIM(c.CEP),
       RTRIM(f.TIPO_FILIAL),
       CAST(CASE WHEN c.INATIVO = 1 OR f.DATA_FECHAMENTO IS NOT NULL
                 THEN 1 ELSE 0 END AS BIT)
FROM DB_HRG3.dbo.FILIAIS f
LEFT JOIN DB_HRG3.dbo.CADASTRO_CLI_FOR c ON c.CLIFOR = f.CLIFOR;
GO

-- ---------- CENTROS DE CUSTO ----------
CREATE OR ALTER VIEW dbo.v_p2p_cost_centers AS
SELECT 'GUESS' AS empresa, RTRIM(CENTRO_CUSTO) AS codigo,
       RTRIM(DESC_CENTRO_CUSTO) AS nome, INATIVA AS inativo
FROM GUESS_PRODUCAO.dbo.CTB_CENTRO_CUSTO
UNION ALL
SELECT 'HERING', RTRIM(CENTRO_CUSTO), RTRIM(DESC_CENTRO_CUSTO), INATIVA
FROM DB_HRG3.dbo.CTB_CENTRO_CUSTO;
GO

-- ---------- FORNECEDORES ----------
-- Cadastro mestre = CADASTRO_CLI_FOR (clientes+fornecedores), filtrado por
-- INDICA_FORNECEDOR=1. FORNECEDORES traz atributos especificos (TIPO, cond. pgto).
-- Inclui dados bancarios/PIX para auto-preencher beneficiario na Solicitacao de Verba.
CREATE OR ALTER VIEW dbo.v_p2p_suppliers AS
SELECT 'GUESS' AS empresa, RTRIM(c.COD_CLIFOR) AS codigo,
       RTRIM(c.NOME_CLIFOR) AS nome, RTRIM(c.RAZAO_SOCIAL) AS razao_social,
       RTRIM(c.CGC_CPF) AS cnpj_cpf,
       CASE WHEN c.PJ_PF = 1 THEN 'PJ' ELSE 'PF' END AS tipo_pessoa,
       RTRIM(c.EMAIL) AS email,
       RTRIM(c.DDD1) + RTRIM(c.TELEFONE1) AS telefone,
       RTRIM(f.TIPO) AS tipo, RTRIM(f.CONDICAO_PGTO) AS condicao_pgto,
       RTRIM(c.BANCO) AS banco, RTRIM(c.CC_AGENCIA) AS agencia,
       RTRIM(c.CC_CONTA) AS conta, RTRIM(c.CHAVE_PIX) AS chave_pix,
       c.INATIVO AS inativo
FROM GUESS_PRODUCAO.dbo.CADASTRO_CLI_FOR c
LEFT JOIN GUESS_PRODUCAO.dbo.FORNECEDORES f ON f.CLIFOR = c.CLIFOR
WHERE c.INDICA_FORNECEDOR = 1
UNION ALL
SELECT 'HERING', RTRIM(c.COD_CLIFOR), RTRIM(c.NOME_CLIFOR), RTRIM(c.RAZAO_SOCIAL),
       RTRIM(c.CGC_CPF), CASE WHEN c.PJ_PF = 1 THEN 'PJ' ELSE 'PF' END,
       RTRIM(c.EMAIL), RTRIM(c.DDD1) + RTRIM(c.TELEFONE1),
       RTRIM(f.TIPO), RTRIM(f.CONDICAO_PGTO),
       RTRIM(c.BANCO), RTRIM(c.CC_AGENCIA), RTRIM(c.CC_CONTA), RTRIM(c.CHAVE_PIX),
       c.INATIVO
FROM DB_HRG3.dbo.CADASTRO_CLI_FOR c
LEFT JOIN DB_HRG3.dbo.FORNECEDORES f ON f.CLIFOR = c.CLIFOR
WHERE c.INDICA_FORNECEDOR = 1;
GO

-- ---------- PLANO DE CONTAS ----------
CREATE OR ALTER VIEW dbo.v_p2p_accounts AS
SELECT 'GUESS' AS empresa, RTRIM(CONTA_CONTABIL) AS codigo, RTRIM(DESC_CONTA) AS nome,
       RTRIM(TIPO_CONTA) AS tipo_conta, INDICA_CTRL_ORCAMENTO AS controla_orcamento,
       INATIVA AS inativo
FROM GUESS_PRODUCAO.dbo.CTB_CONTA_PLANO
UNION ALL
SELECT 'HERING', RTRIM(CONTA_CONTABIL), RTRIM(DESC_CONTA), RTRIM(TIPO_CONTA),
       INDICA_CTRL_ORCAMENTO, INATIVA
FROM DB_HRG3.dbo.CTB_CONTA_PLANO;
GO

-- ---------- CONDIÇÕES DE PAGAMENTO ----------
-- Catálogo de condições de pagamento (COND_ENT_PGTOS). O fornecedor
-- tem uma condição padrão; o usuário pode escolher outra desta lista.
CREATE OR ALTER VIEW dbo.v_p2p_payment_conditions AS
SELECT 'GUESS' AS empresa, RTRIM(CONDICAO_PGTO) AS codigo,
       RTRIM(DESC_COND_PGTO) AS descricao, RTRIM(TIPO_CONDICAO) AS tipo,
       NUMERO_PARCELAS AS parcelas
FROM GUESS_PRODUCAO.dbo.COND_ENT_PGTOS
UNION ALL
SELECT 'HERING', RTRIM(CONDICAO_PGTO), RTRIM(DESC_COND_PGTO),
       RTRIM(TIPO_CONDICAO), NUMERO_PARCELAS
FROM DB_HRG3.dbo.COND_ENT_PGTOS;
GO

-- ---------- ITENS POR FORNECEDOR ----------
-- Vínculo item-fornecedor (SS_ITEM_FISCAL_FORNECEDOR) cruzado com o
-- catálogo. SS_ITEM_FISCAL_FORNECEDOR.CLIFOR = código do fornecedor
-- (mesmo COD_CLIFOR exposto em v_p2p_suppliers). VALOR_UNITARIO do
-- vínculo é ignorado de propósito (faz parte de outro processo).
CREATE OR ALTER VIEW dbo.v_p2p_supplier_items AS
SELECT 'GUESS' AS empresa, RTRIM(sf.CLIFOR) AS fornecedor,
       RTRIM(i.CODIGO_ITEM) AS codigo, RTRIM(i.ITEM_DESCRICAO) AS descricao,
       RTRIM(i.UNIDADE) AS unidade, RTRIM(i.CONTA_CONTABIL) AS conta_contabil_padrao,
       RTRIM(i.RATEIO_FILIAL) AS rateio_filial_padrao,
       RTRIM(i.RATEIO_CENTRO_CUSTO) AS rateio_cc_padrao,
       RTRIM(i.ITEM_FISCAL_GRUPO) AS grupo, i.INATIVO AS inativo
FROM GUESS_PRODUCAO.dbo.SS_ITEM_FISCAL_FORNECEDOR sf
JOIN GUESS_PRODUCAO.dbo.CADASTRO_ITEM_FISCAL i ON i.CODIGO_ITEM = sf.CODIGO_ITEM
UNION ALL
SELECT 'HERING', RTRIM(sf.CLIFOR), RTRIM(i.CODIGO_ITEM), RTRIM(i.ITEM_DESCRICAO),
       RTRIM(i.UNIDADE), RTRIM(i.CONTA_CONTABIL), RTRIM(i.RATEIO_FILIAL),
       RTRIM(i.RATEIO_CENTRO_CUSTO), RTRIM(i.ITEM_FISCAL_GRUPO), i.INATIVO
FROM DB_HRG3.dbo.SS_ITEM_FISCAL_FORNECEDOR sf
JOIN DB_HRG3.dbo.CADASTRO_ITEM_FISCAL i ON i.CODIGO_ITEM = sf.CODIGO_ITEM;
GO

-- ---------- ITENS (catálogo de compras) ----------
CREATE OR ALTER VIEW dbo.v_p2p_items AS
SELECT 'GUESS' AS empresa, RTRIM(CODIGO_ITEM) AS codigo,
       RTRIM(ITEM_DESCRICAO) AS descricao, RTRIM(UNIDADE) AS unidade,
       RTRIM(CONTA_CONTABIL) AS conta_contabil_padrao,
       RTRIM(RATEIO_FILIAL) AS rateio_filial_padrao,
       RTRIM(RATEIO_CENTRO_CUSTO) AS rateio_cc_padrao,
       RTRIM(ITEM_FISCAL_GRUPO) AS grupo, INATIVO AS inativo
FROM GUESS_PRODUCAO.dbo.CADASTRO_ITEM_FISCAL
UNION ALL
SELECT 'HERING', RTRIM(CODIGO_ITEM), RTRIM(ITEM_DESCRICAO), RTRIM(UNIDADE),
       RTRIM(CONTA_CONTABIL), RTRIM(RATEIO_FILIAL), RTRIM(RATEIO_CENTRO_CUSTO),
       RTRIM(ITEM_FISCAL_GRUPO), INATIVO
FROM DB_HRG3.dbo.CADASTRO_ITEM_FISCAL;
GO

-- ---------- RATEIOS DE FILIAL (template + linhas com %) ----------
-- Só rateios ativos e marcados para entrar em lista (RATEIO_ENTRAR_EM_LISTA).
CREATE OR ALTER VIEW dbo.v_p2p_branch_rateios AS
SELECT 'GUESS' AS empresa, RTRIM(r.RATEIO_FILIAL) AS rateio_codigo,
       RTRIM(r.DESC_RATEIO_FILIAL) AS rateio_descricao, r.INATIVO AS rateio_inativo,
       RTRIM(i.COD_FILIAL) AS filial_codigo, i.PORCENTAGEM AS porcentagem
FROM GUESS_PRODUCAO.dbo.CTB_FILIAL_RATEIO r
JOIN GUESS_PRODUCAO.dbo.CTB_FILIAL_RATEIO_ITEM i ON i.RATEIO_FILIAL = r.RATEIO_FILIAL
WHERE r.INATIVO = 0 AND r.RATEIO_ENTRAR_EM_LISTA <> 0
UNION ALL
SELECT 'HERING', RTRIM(r.RATEIO_FILIAL), RTRIM(r.DESC_RATEIO_FILIAL), r.INATIVO,
       RTRIM(i.COD_FILIAL), i.PORCENTAGEM
FROM DB_HRG3.dbo.CTB_FILIAL_RATEIO r
JOIN DB_HRG3.dbo.CTB_FILIAL_RATEIO_ITEM i ON i.RATEIO_FILIAL = r.RATEIO_FILIAL
WHERE r.INATIVO = 0 AND r.RATEIO_ENTRAR_EM_LISTA <> 0;
GO

-- ---------- RATEIOS DE CENTRO DE CUSTO (template + linhas com %) ----------
-- Só rateios ativos e marcados para entrar em lista (RATEIO_ENTRAR_EM_LISTA).
CREATE OR ALTER VIEW dbo.v_p2p_cc_rateios AS
SELECT 'GUESS' AS empresa, RTRIM(r.RATEIO_CENTRO_CUSTO) AS rateio_codigo,
       RTRIM(r.DESC_RATEIO_CENTRO_CUSTO) AS rateio_descricao, r.INATIVO AS rateio_inativo,
       RTRIM(i.CENTRO_CUSTO) AS centro_custo_codigo, RTRIM(i.COD_FILIAL) AS filial_codigo,
       i.PORCENTAGEM AS porcentagem
FROM GUESS_PRODUCAO.dbo.CTB_CENTRO_CUSTO_RATEIO r
JOIN GUESS_PRODUCAO.dbo.CTB_CENTRO_CUSTO_RATEIO_ITEM i ON i.RATEIO_CENTRO_CUSTO = r.RATEIO_CENTRO_CUSTO
WHERE r.INATIVO = 0 AND r.RATEIO_ENTRAR_EM_LISTA <> 0
UNION ALL
SELECT 'HERING', RTRIM(r.RATEIO_CENTRO_CUSTO), RTRIM(r.DESC_RATEIO_CENTRO_CUSTO), r.INATIVO,
       RTRIM(i.CENTRO_CUSTO), RTRIM(i.COD_FILIAL), i.PORCENTAGEM
FROM DB_HRG3.dbo.CTB_CENTRO_CUSTO_RATEIO r
JOIN DB_HRG3.dbo.CTB_CENTRO_CUSTO_RATEIO_ITEM i ON i.RATEIO_CENTRO_CUSTO = r.RATEIO_CENTRO_CUSTO
WHERE r.INATIVO = 0 AND r.RATEIO_ENTRAR_EM_LISTA <> 0;
GO

-- ---------- TIPOS DE COMPRA (Linx) — só consumíveis ----------
CREATE OR ALTER VIEW dbo.v_p2p_compras_tipos AS
SELECT 'GUESS' AS empresa, RTRIM(TIPO_COMPRA) AS tipo_compra,
       RTRIM(AE_DOCUMENTO) AS ae_documento
FROM GUESS_PRODUCAO.dbo.COMPRAS_TIPOS WHERE INDICA_COMPRA_CONSUMO = 1
UNION ALL
SELECT 'HERING', RTRIM(TIPO_COMPRA), RTRIM(AE_DOCUMENTO)
FROM DB_HRG3.dbo.COMPRAS_TIPOS WHERE INDICA_COMPRA_CONSUMO = 1;
GO

-- ---------- TIPO DE OPERAÇÃO CONTÁBIL — só entradas ativas ----------
CREATE OR ALTER VIEW dbo.v_p2p_ctb_tipo_operacao AS
SELECT 'GUESS' AS empresa, CTB_TIPO_OPERACAO AS codigo,
       RTRIM(DESC_TIPO_OPERACAO) AS descricao
FROM GUESS_PRODUCAO.dbo.CTB_LX_TIPO_OPERACAO
WHERE INDICA_ENTRADA_SAIDA = 'E' AND INATIVO = 0
UNION ALL
SELECT 'HERING', CTB_TIPO_OPERACAO, RTRIM(DESC_TIPO_OPERACAO)
FROM DB_HRG3.dbo.CTB_LX_TIPO_OPERACAO
WHERE INDICA_ENTRADA_SAIDA = 'E' AND INATIVO = 0;
GO

-- ---------- NATUREZAS DE ENTRADA (filtradas por CTB_TIPO_OPERACAO no app) ----------
CREATE OR ALTER VIEW dbo.v_p2p_naturezas_entrada AS
SELECT 'GUESS' AS empresa, RTRIM(NATUREZA) AS codigo,
       RTRIM(DESC_NATUREZA) AS descricao, CTB_TIPO_OPERACAO AS ctb_tipo_operacao
FROM GUESS_PRODUCAO.dbo.NATUREZAS_ENTRADAS WHERE INATIVO = 0
UNION ALL
SELECT 'HERING', RTRIM(NATUREZA), RTRIM(DESC_NATUREZA), CTB_TIPO_OPERACAO
FROM DB_HRG3.dbo.NATUREZAS_ENTRADAS WHERE INATIVO = 0;
GO

-- ============================================================
-- PRODUTO ACABADO (PA) — pedidos de compra para revenda
-- COMPRAS.TABELA_FILHA = 'COMPRAS_PRODUTO'. Cancelamento ocorre
-- por item (COMPRAS_PRODUTO.QTDE_CANCELADA), por isso agregamos
-- aqui e derivamos `status_efetivo`:
--   - header 'C' ou 'R'                          → mantém
--   - todos os itens cancelados (cancelada>=orig)→ 'C'
--   - cancelamento parcial                       → 'CP'
--   - caso contrário                             → header
-- ============================================================
CREATE OR ALTER VIEW dbo.v_p2p_product_orders AS
SELECT 'GUESS' AS empresa,
       RTRIM(c.PEDIDO) AS pedido,
       RTRIM(c.FORNECEDOR) AS fornecedor,
       RTRIM(c.FILIAL_A_ENTREGAR) AS filial,
       RTRIM(c.CONDICAO_PGTO) AS condicao_pgto,
       RTRIM(c.MOEDA) AS moeda,
       RTRIM(c.STATUS_COMPRA) AS status_compra,
       RTRIM(c.STATUS_APROVACAO) AS status_aprovacao,
       c.LX_STATUS_COMPRA AS lx_status_compra,
       RTRIM(c.TIPO_COMPRA) AS tipo_compra,
       RTRIM(c.NATUREZA_ENTRADA) AS natureza_entrada,
       c.EMISSAO AS emissao,
       c.CADASTRAMENTO AS cadastramento,
       c.DATA_APROVACAO AS data_aprovacao,
       RTRIM(c.APROVADO_POR) AS aprovado_por,
       RTRIM(c.REQUERIDO_POR) AS requerido_por,
       c.TOT_QTDE_ORIGINAL AS tot_qtde_original,
       c.TOT_QTDE_ENTREGAR AS tot_qtde_entregar,
       ISNULL(agg.qtde_cancelada, 0) AS tot_qtde_cancelada,
       c.TOT_VALOR_ORIGINAL AS tot_valor_original,
       c.TOT_VALOR_ENTREGAR AS tot_valor_entregar,
       agg.proxima_entrega AS proxima_entrega,
       agg.proxima_entrega_original AS proxima_entrega_original,
       CAST(c.OBS AS NVARCHAR(MAX)) AS obs,
       CASE
         -- Header já fechado (cancelado/reprovado) manda.
         WHEN RTRIM(c.STATUS_COMPRA) IN ('C', 'R') THEN RTRIM(c.STATUS_COMPRA)
         -- Tudo cancelado nos itens → cancelado.
         WHEN ISNULL(agg.qtde_original, 0) > 0
              AND ISNULL(agg.qtde_cancelada, 0) >= ISNULL(agg.qtde_original, 0)
              THEN 'C'
         -- Tudo que sobrou (original − cancelada) foi entregue → entregue.
         WHEN ISNULL(agg.qtde_entregue, 0) > 0
              AND ISNULL(agg.qtde_entregue, 0)
                  >= ISNULL(agg.qtde_original, 0) - ISNULL(agg.qtde_cancelada, 0)
              THEN 'D'
         -- Houve entrega, ainda sobra saldo → entrega parcial.
         WHEN ISNULL(agg.qtde_entregue, 0) > 0 THEN 'DP'
         -- Sem entrega ainda, mas teve cancelamento parcial.
         WHEN ISNULL(agg.qtde_cancelada, 0) > 0 THEN 'CP'
         ELSE RTRIM(c.STATUS_COMPRA)
       END AS status_efetivo
FROM GUESS_PRODUCAO.dbo.COMPRAS c
LEFT JOIN (
  SELECT PEDIDO,
         SUM(ISNULL(QTDE_ORIGINAL, 0)) AS qtde_original,
         SUM(ISNULL(QTDE_CANCELADA, 0)) AS qtde_cancelada,
         SUM(ISNULL(QTDE_ENTREGUE, 0)) AS qtde_entregue,
         -- ENTREGA = data original do pedido (nunca muda no reschedule).
         -- LIMITE_ENTREGA = data vigente (pode ser reagendada).
         -- Expomos ambas pra UI mostrar "vigente (original X)".
         MIN(CASE WHEN ISNULL(QTDE_ENTREGAR, 0) > 0 THEN LIMITE_ENTREGA END)
           AS proxima_entrega,
         MIN(CASE WHEN ISNULL(QTDE_ENTREGAR, 0) > 0 THEN ENTREGA END)
           AS proxima_entrega_original
  FROM GUESS_PRODUCAO.dbo.COMPRAS_PRODUTO
  GROUP BY PEDIDO
) agg ON agg.PEDIDO = c.PEDIDO
WHERE RTRIM(c.TABELA_FILHA) = 'COMPRAS_PRODUTO'
UNION ALL
SELECT 'HERING',
       RTRIM(c.PEDIDO), RTRIM(c.FORNECEDOR), RTRIM(c.FILIAL_A_ENTREGAR),
       RTRIM(c.CONDICAO_PGTO), RTRIM(c.MOEDA),
       RTRIM(c.STATUS_COMPRA), RTRIM(c.STATUS_APROVACAO),
       c.LX_STATUS_COMPRA, RTRIM(c.TIPO_COMPRA), RTRIM(c.NATUREZA_ENTRADA),
       c.EMISSAO, c.CADASTRAMENTO, c.DATA_APROVACAO,
       RTRIM(c.APROVADO_POR), RTRIM(c.REQUERIDO_POR),
       c.TOT_QTDE_ORIGINAL, c.TOT_QTDE_ENTREGAR,
       ISNULL(agg.qtde_cancelada, 0),
       c.TOT_VALOR_ORIGINAL, c.TOT_VALOR_ENTREGAR,
       agg.proxima_entrega,
       agg.proxima_entrega_original,
       CAST(c.OBS AS NVARCHAR(MAX)),
       CASE
         -- Header já fechado (cancelado/reprovado) manda.
         WHEN RTRIM(c.STATUS_COMPRA) IN ('C', 'R') THEN RTRIM(c.STATUS_COMPRA)
         -- Tudo cancelado nos itens → cancelado.
         WHEN ISNULL(agg.qtde_original, 0) > 0
              AND ISNULL(agg.qtde_cancelada, 0) >= ISNULL(agg.qtde_original, 0)
              THEN 'C'
         -- Tudo que sobrou (original − cancelada) foi entregue → entregue.
         WHEN ISNULL(agg.qtde_entregue, 0) > 0
              AND ISNULL(agg.qtde_entregue, 0)
                  >= ISNULL(agg.qtde_original, 0) - ISNULL(agg.qtde_cancelada, 0)
              THEN 'D'
         -- Houve entrega, ainda sobra saldo → entrega parcial.
         WHEN ISNULL(agg.qtde_entregue, 0) > 0 THEN 'DP'
         -- Sem entrega ainda, mas teve cancelamento parcial.
         WHEN ISNULL(agg.qtde_cancelada, 0) > 0 THEN 'CP'
         ELSE RTRIM(c.STATUS_COMPRA)
       END
FROM DB_HRG3.dbo.COMPRAS c
LEFT JOIN (
  SELECT PEDIDO,
         SUM(ISNULL(QTDE_ORIGINAL, 0)) AS qtde_original,
         SUM(ISNULL(QTDE_CANCELADA, 0)) AS qtde_cancelada,
         SUM(ISNULL(QTDE_ENTREGUE, 0)) AS qtde_entregue,
         -- ENTREGA = data original do pedido (nunca muda no reschedule).
         -- LIMITE_ENTREGA = data vigente (pode ser reagendada).
         -- Expomos ambas pra UI mostrar "vigente (original X)".
         MIN(CASE WHEN ISNULL(QTDE_ENTREGAR, 0) > 0 THEN LIMITE_ENTREGA END)
           AS proxima_entrega,
         MIN(CASE WHEN ISNULL(QTDE_ENTREGAR, 0) > 0 THEN ENTREGA END)
           AS proxima_entrega_original
  FROM DB_HRG3.dbo.COMPRAS_PRODUTO
  GROUP BY PEDIDO
) agg ON agg.PEDIDO = c.PEDIDO
WHERE RTRIM(c.TABELA_FILHA) = 'COMPRAS_PRODUTO';
GO

-- ---------- ITENS DO PEDIDO DE PRODUTO ACABADO ----------
CREATE OR ALTER VIEW dbo.v_p2p_product_order_items AS
SELECT 'GUESS' AS empresa,
       RTRIM(cp.PEDIDO) AS pedido,
       RTRIM(cp.PRODUTO) AS produto,
       RTRIM(cp.COR_PRODUTO) AS cor,
       cp.ENTREGA AS entrega,
       cp.LIMITE_ENTREGA AS limite_entrega,
       cp.CHEGADA_PREVISTA AS chegada_prevista,
       cp.DATA_CONFIRMACAO AS data_confirmacao,
       cp.QTDE_ORIGINAL AS qtde_original,
       cp.QTDE_CANCELADA AS qtde_cancelada,
       cp.QTDE_ENTREGUE AS qtde_entregue,
       cp.QTDE_ENTREGAR AS qtde_entregar,
       cp.VALOR_ORIGINAL AS valor_original,
       cp.VALOR_ENTREGUE AS valor_entregue,
       cp.VALOR_ENTREGAR AS valor_entregar,
       cp.CUSTO1 AS custo_unit,
       cp.IPI AS ipi_pct,
       cp.DESCONTO_ITEM AS desconto_item,
       CAST(cp.OBS_ITEM AS NVARCHAR(MAX)) AS obs_item
FROM GUESS_PRODUCAO.dbo.COMPRAS_PRODUTO cp
UNION ALL
SELECT 'HERING',
       RTRIM(cp.PEDIDO), RTRIM(cp.PRODUTO), RTRIM(cp.COR_PRODUTO),
       cp.ENTREGA, cp.LIMITE_ENTREGA, cp.CHEGADA_PREVISTA, cp.DATA_CONFIRMACAO,
       cp.QTDE_ORIGINAL, cp.QTDE_CANCELADA, cp.QTDE_ENTREGUE, cp.QTDE_ENTREGAR,
       cp.VALOR_ORIGINAL, cp.VALOR_ENTREGUE, cp.VALOR_ENTREGAR,
       cp.CUSTO1, cp.IPI, cp.DESCONTO_ITEM,
       CAST(cp.OBS_ITEM AS NVARCHAR(MAX))
FROM DB_HRG3.dbo.COMPRAS_PRODUTO cp;
GO

-- ---------- GRADE (vertical) DO ITEM DE PRODUTO ACABADO ----------
CREATE OR ALTER VIEW dbo.v_p2p_product_order_grade AS
SELECT empresa, pedido, produto, cor, entrega, posicao,
       SUM(qtde_original) AS qtde_original,
       SUM(qtde_entregue) AS qtde_entregue
FROM (
  SELECT 'GUESS' AS empresa,
         RTRIM(cp.PEDIDO) AS pedido,
         RTRIM(cp.PRODUTO) AS produto,
         RTRIM(cp.COR_PRODUTO) AS cor,
         cp.ENTREGA AS entrega,
         v.posicao,
         CASE v.posicao
           WHEN 1 THEN cp.CO1 WHEN 2 THEN cp.CO2 WHEN 3 THEN cp.CO3
           WHEN 4 THEN cp.CO4 WHEN 5 THEN cp.CO5 WHEN 6 THEN cp.CO6
           WHEN 7 THEN cp.CO7 WHEN 8 THEN cp.CO8 WHEN 9 THEN cp.CO9
           WHEN 10 THEN cp.CO10 WHEN 11 THEN cp.CO11 WHEN 12 THEN cp.CO12
           WHEN 13 THEN cp.CO13 WHEN 14 THEN cp.CO14 WHEN 15 THEN cp.CO15
           WHEN 16 THEN cp.CO16 WHEN 17 THEN cp.CO17 WHEN 18 THEN cp.CO18
           WHEN 19 THEN cp.CO19 WHEN 20 THEN cp.CO20 WHEN 21 THEN cp.CO21
           WHEN 22 THEN cp.CO22 WHEN 23 THEN cp.CO23 WHEN 24 THEN cp.CO24
           WHEN 25 THEN cp.CO25 WHEN 26 THEN cp.CO26 WHEN 27 THEN cp.CO27
           WHEN 28 THEN cp.CO28 WHEN 29 THEN cp.CO29 WHEN 30 THEN cp.CO30
           WHEN 31 THEN cp.CO31 WHEN 32 THEN cp.CO32 WHEN 33 THEN cp.CO33
           WHEN 34 THEN cp.CO34 WHEN 35 THEN cp.CO35 WHEN 36 THEN cp.CO36
           WHEN 37 THEN cp.CO37 WHEN 38 THEN cp.CO38 WHEN 39 THEN cp.CO39
           WHEN 40 THEN cp.CO40 WHEN 41 THEN cp.CO41 WHEN 42 THEN cp.CO42
           WHEN 43 THEN cp.CO43 WHEN 44 THEN cp.CO44 WHEN 45 THEN cp.CO45
           WHEN 46 THEN cp.CO46 WHEN 47 THEN cp.CO47 WHEN 48 THEN cp.CO48
         END AS qtde_original,
         -- CE = saldo "a entregar" no Linx. Entregue = original − saldo.
         CASE v.posicao
           WHEN 1 THEN ISNULL(cp.CO1,0)-ISNULL(cp.CE1,0)
           WHEN 2 THEN ISNULL(cp.CO2,0)-ISNULL(cp.CE2,0)
           WHEN 3 THEN ISNULL(cp.CO3,0)-ISNULL(cp.CE3,0)
           WHEN 4 THEN ISNULL(cp.CO4,0)-ISNULL(cp.CE4,0)
           WHEN 5 THEN ISNULL(cp.CO5,0)-ISNULL(cp.CE5,0)
           WHEN 6 THEN ISNULL(cp.CO6,0)-ISNULL(cp.CE6,0)
           WHEN 7 THEN ISNULL(cp.CO7,0)-ISNULL(cp.CE7,0)
           WHEN 8 THEN ISNULL(cp.CO8,0)-ISNULL(cp.CE8,0)
           WHEN 9 THEN ISNULL(cp.CO9,0)-ISNULL(cp.CE9,0)
           WHEN 10 THEN ISNULL(cp.CO10,0)-ISNULL(cp.CE10,0)
           WHEN 11 THEN ISNULL(cp.CO11,0)-ISNULL(cp.CE11,0)
           WHEN 12 THEN ISNULL(cp.CO12,0)-ISNULL(cp.CE12,0)
           WHEN 13 THEN ISNULL(cp.CO13,0)-ISNULL(cp.CE13,0)
           WHEN 14 THEN ISNULL(cp.CO14,0)-ISNULL(cp.CE14,0)
           WHEN 15 THEN ISNULL(cp.CO15,0)-ISNULL(cp.CE15,0)
           WHEN 16 THEN ISNULL(cp.CO16,0)-ISNULL(cp.CE16,0)
           WHEN 17 THEN ISNULL(cp.CO17,0)-ISNULL(cp.CE17,0)
           WHEN 18 THEN ISNULL(cp.CO18,0)-ISNULL(cp.CE18,0)
           WHEN 19 THEN ISNULL(cp.CO19,0)-ISNULL(cp.CE19,0)
           WHEN 20 THEN ISNULL(cp.CO20,0)-ISNULL(cp.CE20,0)
           WHEN 21 THEN ISNULL(cp.CO21,0)-ISNULL(cp.CE21,0)
           WHEN 22 THEN ISNULL(cp.CO22,0)-ISNULL(cp.CE22,0)
           WHEN 23 THEN ISNULL(cp.CO23,0)-ISNULL(cp.CE23,0)
           WHEN 24 THEN ISNULL(cp.CO24,0)-ISNULL(cp.CE24,0)
           WHEN 25 THEN ISNULL(cp.CO25,0)-ISNULL(cp.CE25,0)
           WHEN 26 THEN ISNULL(cp.CO26,0)-ISNULL(cp.CE26,0)
           WHEN 27 THEN ISNULL(cp.CO27,0)-ISNULL(cp.CE27,0)
           WHEN 28 THEN ISNULL(cp.CO28,0)-ISNULL(cp.CE28,0)
           WHEN 29 THEN ISNULL(cp.CO29,0)-ISNULL(cp.CE29,0)
           WHEN 30 THEN ISNULL(cp.CO30,0)-ISNULL(cp.CE30,0)
           WHEN 31 THEN ISNULL(cp.CO31,0)-ISNULL(cp.CE31,0)
           WHEN 32 THEN ISNULL(cp.CO32,0)-ISNULL(cp.CE32,0)
           WHEN 33 THEN ISNULL(cp.CO33,0)-ISNULL(cp.CE33,0)
           WHEN 34 THEN ISNULL(cp.CO34,0)-ISNULL(cp.CE34,0)
           WHEN 35 THEN ISNULL(cp.CO35,0)-ISNULL(cp.CE35,0)
           WHEN 36 THEN ISNULL(cp.CO36,0)-ISNULL(cp.CE36,0)
           WHEN 37 THEN ISNULL(cp.CO37,0)-ISNULL(cp.CE37,0)
           WHEN 38 THEN ISNULL(cp.CO38,0)-ISNULL(cp.CE38,0)
           WHEN 39 THEN ISNULL(cp.CO39,0)-ISNULL(cp.CE39,0)
           WHEN 40 THEN ISNULL(cp.CO40,0)-ISNULL(cp.CE40,0)
           WHEN 41 THEN ISNULL(cp.CO41,0)-ISNULL(cp.CE41,0)
           WHEN 42 THEN ISNULL(cp.CO42,0)-ISNULL(cp.CE42,0)
           WHEN 43 THEN ISNULL(cp.CO43,0)-ISNULL(cp.CE43,0)
           WHEN 44 THEN ISNULL(cp.CO44,0)-ISNULL(cp.CE44,0)
           WHEN 45 THEN ISNULL(cp.CO45,0)-ISNULL(cp.CE45,0)
           WHEN 46 THEN ISNULL(cp.CO46,0)-ISNULL(cp.CE46,0)
           WHEN 47 THEN ISNULL(cp.CO47,0)-ISNULL(cp.CE47,0)
           WHEN 48 THEN ISNULL(cp.CO48,0)-ISNULL(cp.CE48,0)
         END AS qtde_entregue
  FROM GUESS_PRODUCAO.dbo.COMPRAS_PRODUTO cp
  CROSS JOIN (VALUES
    (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),
    (11),(12),(13),(14),(15),(16),(17),(18),(19),(20),
    (21),(22),(23),(24),(25),(26),(27),(28),(29),(30),
    (31),(32),(33),(34),(35),(36),(37),(38),(39),(40),
    (41),(42),(43),(44),(45),(46),(47),(48)
  ) AS v(posicao)
  UNION ALL
  SELECT 'HERING' AS empresa,
         RTRIM(cp.PEDIDO), RTRIM(cp.PRODUTO), RTRIM(cp.COR_PRODUTO),
         cp.ENTREGA, v.posicao,
         CASE v.posicao
           WHEN 1 THEN cp.CO1 WHEN 2 THEN cp.CO2 WHEN 3 THEN cp.CO3
           WHEN 4 THEN cp.CO4 WHEN 5 THEN cp.CO5 WHEN 6 THEN cp.CO6
           WHEN 7 THEN cp.CO7 WHEN 8 THEN cp.CO8 WHEN 9 THEN cp.CO9
           WHEN 10 THEN cp.CO10 WHEN 11 THEN cp.CO11 WHEN 12 THEN cp.CO12
           WHEN 13 THEN cp.CO13 WHEN 14 THEN cp.CO14 WHEN 15 THEN cp.CO15
           WHEN 16 THEN cp.CO16 WHEN 17 THEN cp.CO17 WHEN 18 THEN cp.CO18
           WHEN 19 THEN cp.CO19 WHEN 20 THEN cp.CO20 WHEN 21 THEN cp.CO21
           WHEN 22 THEN cp.CO22 WHEN 23 THEN cp.CO23 WHEN 24 THEN cp.CO24
           WHEN 25 THEN cp.CO25 WHEN 26 THEN cp.CO26 WHEN 27 THEN cp.CO27
           WHEN 28 THEN cp.CO28 WHEN 29 THEN cp.CO29 WHEN 30 THEN cp.CO30
           WHEN 31 THEN cp.CO31 WHEN 32 THEN cp.CO32 WHEN 33 THEN cp.CO33
           WHEN 34 THEN cp.CO34 WHEN 35 THEN cp.CO35 WHEN 36 THEN cp.CO36
           WHEN 37 THEN cp.CO37 WHEN 38 THEN cp.CO38 WHEN 39 THEN cp.CO39
           WHEN 40 THEN cp.CO40 WHEN 41 THEN cp.CO41 WHEN 42 THEN cp.CO42
           WHEN 43 THEN cp.CO43 WHEN 44 THEN cp.CO44 WHEN 45 THEN cp.CO45
           WHEN 46 THEN cp.CO46 WHEN 47 THEN cp.CO47 WHEN 48 THEN cp.CO48
         END,
         CASE v.posicao
           WHEN 1 THEN cp.CE1 WHEN 2 THEN cp.CE2 WHEN 3 THEN cp.CE3
           WHEN 4 THEN cp.CE4 WHEN 5 THEN cp.CE5 WHEN 6 THEN cp.CE6
           WHEN 7 THEN cp.CE7 WHEN 8 THEN cp.CE8 WHEN 9 THEN cp.CE9
           WHEN 10 THEN cp.CE10 WHEN 11 THEN cp.CE11 WHEN 12 THEN cp.CE12
           WHEN 13 THEN cp.CE13 WHEN 14 THEN cp.CE14 WHEN 15 THEN cp.CE15
           WHEN 16 THEN cp.CE16 WHEN 17 THEN cp.CE17 WHEN 18 THEN cp.CE18
           WHEN 19 THEN cp.CE19 WHEN 20 THEN cp.CE20 WHEN 21 THEN cp.CE21
           WHEN 22 THEN cp.CE22 WHEN 23 THEN cp.CE23 WHEN 24 THEN cp.CE24
           WHEN 25 THEN cp.CE25 WHEN 26 THEN cp.CE26 WHEN 27 THEN cp.CE27
           WHEN 28 THEN cp.CE28 WHEN 29 THEN cp.CE29 WHEN 30 THEN cp.CE30
           WHEN 31 THEN cp.CE31 WHEN 32 THEN cp.CE32 WHEN 33 THEN cp.CE33
           WHEN 34 THEN cp.CE34 WHEN 35 THEN cp.CE35 WHEN 36 THEN cp.CE36
           WHEN 37 THEN cp.CE37 WHEN 38 THEN cp.CE38 WHEN 39 THEN cp.CE39
           WHEN 40 THEN cp.CE40 WHEN 41 THEN cp.CE41 WHEN 42 THEN cp.CE42
           WHEN 43 THEN cp.CE43 WHEN 44 THEN cp.CE44 WHEN 45 THEN cp.CE45
           WHEN 46 THEN cp.CE46 WHEN 47 THEN cp.CE47 WHEN 48 THEN cp.CE48
         END
  FROM DB_HRG3.dbo.COMPRAS_PRODUTO cp
  CROSS JOIN (VALUES
    (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),
    (11),(12),(13),(14),(15),(16),(17),(18),(19),(20),
    (21),(22),(23),(24),(25),(26),(27),(28),(29),(30),
    (31),(32),(33),(34),(35),(36),(37),(38),(39),(40),
    (41),(42),(43),(44),(45),(46),(47),(48)
  ) AS v(posicao)
) src
WHERE qtde_original > 0 OR qtde_entregue > 0
GROUP BY empresa, pedido, produto, cor, entrega, posicao;
GO

-- ---------- DE-PARA POSIÇÃO DA GRADE → NOME DO TAMANHO ----------
CREATE OR ALTER VIEW dbo.v_p2p_grade_tamanhos AS
SELECT 'GUESS' AS empresa, RTRIM(grade) AS grade, posicao, RTRIM(tamanho) AS tamanho
FROM GUESS_PRODUCAO.dbo.PRODUTOS_TAMANHOS
CROSS APPLY (VALUES
  ( 1, TAMANHO_1),  ( 2, TAMANHO_2),  ( 3, TAMANHO_3),  ( 4, TAMANHO_4),
  ( 5, TAMANHO_5),  ( 6, TAMANHO_6),  ( 7, TAMANHO_7),  ( 8, TAMANHO_8),
  ( 9, TAMANHO_9),  (10, TAMANHO_10), (11, TAMANHO_11), (12, TAMANHO_12),
  (13, TAMANHO_13), (14, TAMANHO_14), (15, TAMANHO_15), (16, TAMANHO_16),
  (17, TAMANHO_17), (18, TAMANHO_18), (19, TAMANHO_19), (20, TAMANHO_20),
  (21, TAMANHO_21), (22, TAMANHO_22), (23, TAMANHO_23), (24, TAMANHO_24),
  (25, TAMANHO_25), (26, TAMANHO_26), (27, TAMANHO_27), (28, TAMANHO_28),
  (29, TAMANHO_29), (30, TAMANHO_30), (31, TAMANHO_31), (32, TAMANHO_32),
  (33, TAMANHO_33), (34, TAMANHO_34), (35, TAMANHO_35), (36, TAMANHO_36),
  (37, TAMANHO_37), (38, TAMANHO_38), (39, TAMANHO_39), (40, TAMANHO_40),
  (41, TAMANHO_41), (42, TAMANHO_42), (43, TAMANHO_43), (44, TAMANHO_44),
  (45, TAMANHO_45), (46, TAMANHO_46), (47, TAMANHO_47), (48, TAMANHO_48)
) v(posicao, tamanho)
WHERE LTRIM(RTRIM(ISNULL(tamanho, ''))) <> ''
UNION ALL
SELECT 'HERING', RTRIM(grade), posicao, RTRIM(tamanho)
FROM DB_HRG3.dbo.PRODUTOS_TAMANHOS
CROSS APPLY (VALUES
  ( 1, TAMANHO_1),  ( 2, TAMANHO_2),  ( 3, TAMANHO_3),  ( 4, TAMANHO_4),
  ( 5, TAMANHO_5),  ( 6, TAMANHO_6),  ( 7, TAMANHO_7),  ( 8, TAMANHO_8),
  ( 9, TAMANHO_9),  (10, TAMANHO_10), (11, TAMANHO_11), (12, TAMANHO_12),
  (13, TAMANHO_13), (14, TAMANHO_14), (15, TAMANHO_15), (16, TAMANHO_16),
  (17, TAMANHO_17), (18, TAMANHO_18), (19, TAMANHO_19), (20, TAMANHO_20),
  (21, TAMANHO_21), (22, TAMANHO_22), (23, TAMANHO_23), (24, TAMANHO_24),
  (25, TAMANHO_25), (26, TAMANHO_26), (27, TAMANHO_27), (28, TAMANHO_28),
  (29, TAMANHO_29), (30, TAMANHO_30), (31, TAMANHO_31), (32, TAMANHO_32),
  (33, TAMANHO_33), (34, TAMANHO_34), (35, TAMANHO_35), (36, TAMANHO_36),
  (37, TAMANHO_37), (38, TAMANHO_38), (39, TAMANHO_39), (40, TAMANHO_40),
  (41, TAMANHO_41), (42, TAMANHO_42), (43, TAMANHO_43), (44, TAMANHO_44),
  (45, TAMANHO_45), (46, TAMANHO_46), (47, TAMANHO_47), (48, TAMANHO_48)
) v(posicao, tamanho)
WHERE LTRIM(RTRIM(ISNULL(tamanho, ''))) <> '';
GO

-- ============================================================
-- NOTAS FISCAIS DE ENTRADA vinculadas a pedidos PA
-- ENTRADAS_PRODUTO traz, por linha de item, qual NF o entregou.
-- Convenções do Linx:
--   - NF_ENTRADA tem padding de espaços (RTRIM sempre).
--   - SERIE_NF do header pode vir NULL; a série confiável é a do item
--     (SERIE_NF_ENTRADA).
--   - Não existe FK por código de fornecedor — JOIN com ENTRADAS é por
--     NF_ENTRADA + NOME_CLIFOR (nome textual).
-- ============================================================

-- ---------- NFs DO PEDIDO (uma linha por NF distinta) ----------
CREATE OR ALTER VIEW dbo.v_p2p_product_order_nfs AS
SELECT 'GUESS' AS empresa,
       RTRIM(ep.PEDIDO) AS pedido,
       RTRIM(ep.NF_ENTRADA) AS nf,
       RTRIM(ep.SERIE_NF_ENTRADA) AS serie,
       RTRIM(ep.NOME_CLIFOR) AS fornecedor,
       MAX(e.EMISSAO) AS emissao,
       MAX(e.RECEBIMENTO) AS recebimento,
       MAX(e.FILIAL_ENTRADA) AS filial_entrada,
       SUM(ISNULL(ep.TOTAL_ENTRADAS, 0)) AS qtde_total,
       SUM(ISNULL(ep.VALOR, 0) * ISNULL(ep.TOTAL_ENTRADAS, 0)) AS valor_total
FROM GUESS_PRODUCAO.dbo.ENTRADAS_PRODUTO ep
LEFT JOIN GUESS_PRODUCAO.dbo.ENTRADAS e
  ON e.NF_ENTRADA = ep.NF_ENTRADA AND e.NOME_CLIFOR = ep.NOME_CLIFOR
GROUP BY ep.PEDIDO, ep.NF_ENTRADA, ep.SERIE_NF_ENTRADA, ep.NOME_CLIFOR
UNION ALL
SELECT 'HERING',
       RTRIM(ep.PEDIDO), RTRIM(ep.NF_ENTRADA), RTRIM(ep.SERIE_NF_ENTRADA),
       RTRIM(ep.NOME_CLIFOR),
       MAX(e.EMISSAO), MAX(e.RECEBIMENTO), MAX(e.FILIAL_ENTRADA),
       SUM(ISNULL(ep.TOTAL_ENTRADAS, 0)),
       SUM(ISNULL(ep.VALOR, 0) * ISNULL(ep.TOTAL_ENTRADAS, 0))
FROM DB_HRG3.dbo.ENTRADAS_PRODUTO ep
LEFT JOIN DB_HRG3.dbo.ENTRADAS e
  ON e.NF_ENTRADA = ep.NF_ENTRADA AND e.NOME_CLIFOR = ep.NOME_CLIFOR
GROUP BY ep.PEDIDO, ep.NF_ENTRADA, ep.SERIE_NF_ENTRADA, ep.NOME_CLIFOR;
GO

-- ---------- NFs POR ITEM DO PEDIDO ----------
-- Cada item (pedido,produto,cor,entrega) pode ter sido entregue em N NFs
-- (entrega parcelada). PRODUTO_PEDIDO/COR_PRODUTO_PEDIDO/ENTREGA_PEDIDO
-- preservam o item original do pedido caso a NF tenha trocado o produto
-- (devolução com substituição, p. ex.) — usamos esses pra casar com o item.
CREATE OR ALTER VIEW dbo.v_p2p_product_order_item_nfs AS
SELECT 'GUESS' AS empresa,
       RTRIM(ep.PEDIDO) AS pedido,
       RTRIM(ep.PRODUTO_PEDIDO) AS produto,
       RTRIM(ep.COR_PRODUTO_PEDIDO) AS cor,
       ep.ENTREGA_PEDIDO AS entrega,
       RTRIM(ep.NF_ENTRADA) AS nf,
       RTRIM(ep.SERIE_NF_ENTRADA) AS serie,
       RTRIM(ep.NOME_CLIFOR) AS fornecedor,
       e.EMISSAO AS emissao,
       e.RECEBIMENTO AS recebimento,
       ISNULL(ep.TOTAL_ENTRADAS, 0) AS qtde,
       ISNULL(ep.VALOR, 0) AS valor_unit,
       ISNULL(ep.VALOR, 0) * ISNULL(ep.TOTAL_ENTRADAS, 0) AS valor_total,
       CAST(ISNULL(ep.MATA_SALDO_PEDIDO, 0) AS BIT) AS mata_saldo
FROM GUESS_PRODUCAO.dbo.ENTRADAS_PRODUTO ep
LEFT JOIN GUESS_PRODUCAO.dbo.ENTRADAS e
  ON e.NF_ENTRADA = ep.NF_ENTRADA AND e.NOME_CLIFOR = ep.NOME_CLIFOR
UNION ALL
SELECT 'HERING',
       RTRIM(ep.PEDIDO), RTRIM(ep.PRODUTO_PEDIDO), RTRIM(ep.COR_PRODUTO_PEDIDO),
       ep.ENTREGA_PEDIDO,
       RTRIM(ep.NF_ENTRADA), RTRIM(ep.SERIE_NF_ENTRADA), RTRIM(ep.NOME_CLIFOR),
       e.EMISSAO, e.RECEBIMENTO,
       ISNULL(ep.TOTAL_ENTRADAS, 0),
       ISNULL(ep.VALOR, 0),
       ISNULL(ep.VALOR, 0) * ISNULL(ep.TOTAL_ENTRADAS, 0),
       CAST(ISNULL(ep.MATA_SALDO_PEDIDO, 0) AS BIT)
FROM DB_HRG3.dbo.ENTRADAS_PRODUTO ep
LEFT JOIN DB_HRG3.dbo.ENTRADAS e
  ON e.NF_ENTRADA = ep.NF_ENTRADA AND e.NOME_CLIFOR = ep.NOME_CLIFOR;
GO

-- ---------- DE-PARA DE STATUS DE COMPRA ----------
-- COMPRAS_STATUS no Linx tem (STATUS_COMPRA, DESC_STATUS_COMPRA).
-- Unimos GUESS+HERING e deduplicamos (são as mesmas chaves nos dois).
CREATE OR ALTER VIEW dbo.v_p2p_compras_status AS
SELECT DISTINCT RTRIM(STATUS_COMPRA) AS codigo,
       RTRIM(DESC_STATUS_COMPRA) AS descricao
FROM GUESS_PRODUCAO.dbo.COMPRAS_STATUS
UNION
SELECT DISTINCT RTRIM(STATUS_COMPRA), RTRIM(DESC_STATUS_COMPRA)
FROM DB_HRG3.dbo.COMPRAS_STATUS;
GO
