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
