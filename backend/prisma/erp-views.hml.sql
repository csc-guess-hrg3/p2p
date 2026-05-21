-- ============================================================
-- Views de integração ERP — HOMOLOGAÇÃO
-- Criadas no HML_P2P_DB; leem HML_GUESS (cross-database, servidor .34)
-- Versão Guess-only — não há HML_HERING ainda.
-- Espelha erp-views.sql: ao mudar lá, refletir aqui.
-- ============================================================

-- ---------- FILIAIS ----------
CREATE OR ALTER VIEW dbo.v_p2p_branches AS
SELECT 'GUESS' AS empresa, RTRIM(f.COD_FILIAL) AS codigo, RTRIM(f.FILIAL) AS nome,
       RTRIM(c.RAZAO_SOCIAL) AS razao_social, RTRIM(f.CGC_CPF) AS cnpj,
       RTRIM(c.RG_IE) AS ie, RTRIM(c.ENDERECO) AS logradouro,
       RTRIM(c.NUMERO) AS numero, RTRIM(c.BAIRRO) AS bairro,
       RTRIM(c.CIDADE) AS cidade, RTRIM(c.UF) AS uf, RTRIM(c.CEP) AS cep,
       RTRIM(f.TIPO_FILIAL) AS tipo,
       CAST(CASE WHEN c.INATIVO = 1 OR f.DATA_FECHAMENTO IS NOT NULL
                 THEN 1 ELSE 0 END AS BIT) AS inativo
FROM HML_GUESS.dbo.FILIAIS f
LEFT JOIN HML_GUESS.dbo.CADASTRO_CLI_FOR c ON c.CLIFOR = f.CLIFOR;
GO

-- ---------- CENTROS DE CUSTO ----------
CREATE OR ALTER VIEW dbo.v_p2p_cost_centers AS
SELECT 'GUESS' AS empresa, RTRIM(CENTRO_CUSTO) AS codigo,
       RTRIM(DESC_CENTRO_CUSTO) AS nome, INATIVA AS inativo
FROM HML_GUESS.dbo.CTB_CENTRO_CUSTO;
GO

-- ---------- FORNECEDORES ----------
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
FROM HML_GUESS.dbo.CADASTRO_CLI_FOR c
LEFT JOIN HML_GUESS.dbo.FORNECEDORES f ON f.CLIFOR = c.CLIFOR
WHERE c.INDICA_FORNECEDOR = 1;
GO

-- ---------- PLANO DE CONTAS ----------
CREATE OR ALTER VIEW dbo.v_p2p_accounts AS
SELECT 'GUESS' AS empresa, RTRIM(CONTA_CONTABIL) AS codigo, RTRIM(DESC_CONTA) AS nome,
       RTRIM(TIPO_CONTA) AS tipo_conta, INDICA_CTRL_ORCAMENTO AS controla_orcamento,
       INATIVA AS inativo
FROM HML_GUESS.dbo.CTB_CONTA_PLANO;
GO

-- ---------- CONDIÇÕES DE PAGAMENTO ----------
CREATE OR ALTER VIEW dbo.v_p2p_payment_conditions AS
SELECT 'GUESS' AS empresa, RTRIM(CONDICAO_PGTO) AS codigo,
       RTRIM(DESC_COND_PGTO) AS descricao, RTRIM(TIPO_CONDICAO) AS tipo,
       NUMERO_PARCELAS AS parcelas
FROM HML_GUESS.dbo.COND_ENT_PGTOS;
GO

-- ---------- ITENS POR FORNECEDOR ----------
CREATE OR ALTER VIEW dbo.v_p2p_supplier_items AS
SELECT 'GUESS' AS empresa, RTRIM(sf.CLIFOR) AS fornecedor,
       RTRIM(i.CODIGO_ITEM) AS codigo, RTRIM(i.ITEM_DESCRICAO) AS descricao,
       RTRIM(i.UNIDADE) AS unidade, RTRIM(i.CONTA_CONTABIL) AS conta_contabil_padrao,
       RTRIM(i.RATEIO_FILIAL) AS rateio_filial_padrao,
       RTRIM(i.RATEIO_CENTRO_CUSTO) AS rateio_cc_padrao,
       RTRIM(i.ITEM_FISCAL_GRUPO) AS grupo, i.INATIVO AS inativo
FROM HML_GUESS.dbo.SS_ITEM_FISCAL_FORNECEDOR sf
JOIN HML_GUESS.dbo.CADASTRO_ITEM_FISCAL i ON i.CODIGO_ITEM = sf.CODIGO_ITEM;
GO

-- ---------- ITENS (catálogo de compras) ----------
CREATE OR ALTER VIEW dbo.v_p2p_items AS
SELECT 'GUESS' AS empresa, RTRIM(CODIGO_ITEM) AS codigo,
       RTRIM(ITEM_DESCRICAO) AS descricao, RTRIM(UNIDADE) AS unidade,
       RTRIM(CONTA_CONTABIL) AS conta_contabil_padrao,
       RTRIM(RATEIO_FILIAL) AS rateio_filial_padrao,
       RTRIM(RATEIO_CENTRO_CUSTO) AS rateio_cc_padrao,
       RTRIM(ITEM_FISCAL_GRUPO) AS grupo, INATIVO AS inativo
FROM HML_GUESS.dbo.CADASTRO_ITEM_FISCAL;
GO

-- ---------- RATEIOS DE FILIAL ----------
CREATE OR ALTER VIEW dbo.v_p2p_branch_rateios AS
SELECT 'GUESS' AS empresa, RTRIM(r.RATEIO_FILIAL) AS rateio_codigo,
       RTRIM(r.DESC_RATEIO_FILIAL) AS rateio_descricao, r.INATIVO AS rateio_inativo,
       RTRIM(i.COD_FILIAL) AS filial_codigo, i.PORCENTAGEM AS porcentagem
FROM HML_GUESS.dbo.CTB_FILIAL_RATEIO r
JOIN HML_GUESS.dbo.CTB_FILIAL_RATEIO_ITEM i ON i.RATEIO_FILIAL = r.RATEIO_FILIAL
WHERE r.INATIVO = 0 AND r.RATEIO_ENTRAR_EM_LISTA <> 0;
GO

-- ---------- RATEIOS DE CENTRO DE CUSTO ----------
CREATE OR ALTER VIEW dbo.v_p2p_cc_rateios AS
SELECT 'GUESS' AS empresa, RTRIM(r.RATEIO_CENTRO_CUSTO) AS rateio_codigo,
       RTRIM(r.DESC_RATEIO_CENTRO_CUSTO) AS rateio_descricao, r.INATIVO AS rateio_inativo,
       RTRIM(i.CENTRO_CUSTO) AS centro_custo_codigo, RTRIM(i.COD_FILIAL) AS filial_codigo,
       i.PORCENTAGEM AS porcentagem
FROM HML_GUESS.dbo.CTB_CENTRO_CUSTO_RATEIO r
JOIN HML_GUESS.dbo.CTB_CENTRO_CUSTO_RATEIO_ITEM i ON i.RATEIO_CENTRO_CUSTO = r.RATEIO_CENTRO_CUSTO
WHERE r.INATIVO = 0 AND r.RATEIO_ENTRAR_EM_LISTA <> 0;
GO

-- ---------- TIPOS DE COMPRA (Linx) ----------
-- Lista de TIPO_COMPRA aplicáveis ao fluxo de consumíveis (P2P).
CREATE OR ALTER VIEW dbo.v_p2p_compras_tipos AS
SELECT 'GUESS' AS empresa, RTRIM(TIPO_COMPRA) AS tipo_compra,
       RTRIM(AE_DOCUMENTO) AS ae_documento
FROM HML_GUESS.dbo.COMPRAS_TIPOS
WHERE INDICA_COMPRA_CONSUMO = 1;
GO

-- ---------- TIPO DE OPERAÇÃO CONTÁBIL — entradas ativas ----------
CREATE OR ALTER VIEW dbo.v_p2p_ctb_tipo_operacao AS
SELECT 'GUESS' AS empresa, CTB_TIPO_OPERACAO AS codigo,
       RTRIM(DESC_TIPO_OPERACAO) AS descricao
FROM HML_GUESS.dbo.CTB_LX_TIPO_OPERACAO
WHERE INDICA_ENTRADA_SAIDA = 'E' AND INATIVO = 0;
GO

-- ---------- NATUREZAS DE ENTRADA ----------
-- Filtradas pelo CTB_TIPO_OPERACAO escolhido (cascade na tela do fiscal).
CREATE OR ALTER VIEW dbo.v_p2p_naturezas_entrada AS
SELECT 'GUESS' AS empresa, RTRIM(NATUREZA) AS codigo,
       RTRIM(DESC_NATUREZA) AS descricao, CTB_TIPO_OPERACAO AS ctb_tipo_operacao
FROM HML_GUESS.dbo.NATUREZAS_ENTRADAS
WHERE INATIVO = 0;
GO

-- ---------- PEDIDO DE COMPRA DE PRODUTO ACABADO (cabeçalho) ----------
-- Apenas pedidos com TABELA_FILHA='COMPRAS_PRODUTO'. Linx não materializa
-- o cancelamento no header (é por item em COMPRAS_PRODUTO.QTDE_CANCELADA),
-- então aqui agregamos QTDE_ORIGINAL/QTDE_CANCELADA por pedido e derivamos
-- um `status_efetivo`:
--   - header 'C' ou 'R' → mantém
--   - todos os itens totalmente cancelados (cancelada >= original) → 'C'
--   - há cancelamento parcial → 'CP' (cancelado parcial — código P2P)
--   - caso contrário → status do header
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
       CAST(c.OBS AS NVARCHAR(MAX)) AS obs,
       CASE
         WHEN RTRIM(c.STATUS_COMPRA) IN ('C', 'R') THEN RTRIM(c.STATUS_COMPRA)
         WHEN ISNULL(agg.qtde_original, 0) > 0
              AND ISNULL(agg.qtde_cancelada, 0) >= ISNULL(agg.qtde_original, 0)
              THEN 'C'
         WHEN ISNULL(agg.qtde_cancelada, 0) > 0 THEN 'CP'
         ELSE RTRIM(c.STATUS_COMPRA)
       END AS status_efetivo
FROM HML_GUESS.dbo.COMPRAS c
LEFT JOIN (
  SELECT PEDIDO,
         SUM(ISNULL(QTDE_ORIGINAL, 0)) AS qtde_original,
         SUM(ISNULL(QTDE_CANCELADA, 0)) AS qtde_cancelada
  FROM HML_GUESS.dbo.COMPRAS_PRODUTO
  GROUP BY PEDIDO
) agg ON agg.PEDIDO = c.PEDIDO
WHERE RTRIM(c.TABELA_FILHA) = 'COMPRAS_PRODUTO';
GO

-- ---------- ITENS DO PEDIDO DE PRODUTO ACABADO ----------
-- Uma linha por (PEDIDO, PRODUTO, COR_PRODUTO, ENTREGA). A grade
-- (CO1..CO48 / CE1..CE48) NÃO é exposta aqui — fica para a view
-- vertical (v_p2p_product_order_grade) por simplicidade.
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
FROM HML_GUESS.dbo.COMPRAS_PRODUTO cp;
GO

-- ---------- GRADE (vertical) DO ITEM DE PRODUTO ACABADO ----------
-- Transforma as 48 colunas CO/CE em linhas (posicao, qtde_original,
-- qtde_entregue). Quem chama filtra pelo (pedido, produto, cor, entrega).
-- O cliente faz o de-para `posicao -> nome do tamanho` via
-- PRODUTOS_TAMANHOS / GUESS_PRODUTOS_TAMANHOS.
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
         END AS qtde_entregue
  FROM HML_GUESS.dbo.COMPRAS_PRODUTO cp
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
-- PRODUTOS_TAMANHOS guarda TAMANHO_1..TAMANHO_48 em colunas. Aqui
-- verticalizamos para (grade, posicao, tamanho) e filtramos posições
-- vazias. O cliente faz JOIN posição→nome a partir da grade do produto.
CREATE OR ALTER VIEW dbo.v_p2p_grade_tamanhos AS
SELECT 'GUESS' AS empresa, RTRIM(grade) AS grade, posicao, RTRIM(tamanho) AS tamanho
FROM HML_GUESS.dbo.PRODUTOS_TAMANHOS
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
