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
CREATE OR ALTER VIEW dbo.v_p2p_branch_rateios AS
SELECT 'GUESS' AS empresa, RTRIM(r.RATEIO_FILIAL) AS rateio_codigo,
       RTRIM(r.DESC_RATEIO_FILIAL) AS rateio_descricao, r.INATIVO AS rateio_inativo,
       RTRIM(i.COD_FILIAL) AS filial_codigo, i.PORCENTAGEM AS porcentagem
FROM GUESS_PRODUCAO.dbo.CTB_FILIAL_RATEIO r
JOIN GUESS_PRODUCAO.dbo.CTB_FILIAL_RATEIO_ITEM i ON i.RATEIO_FILIAL = r.RATEIO_FILIAL
UNION ALL
SELECT 'HERING', RTRIM(r.RATEIO_FILIAL), RTRIM(r.DESC_RATEIO_FILIAL), r.INATIVO,
       RTRIM(i.COD_FILIAL), i.PORCENTAGEM
FROM DB_HRG3.dbo.CTB_FILIAL_RATEIO r
JOIN DB_HRG3.dbo.CTB_FILIAL_RATEIO_ITEM i ON i.RATEIO_FILIAL = r.RATEIO_FILIAL;
GO

-- ---------- RATEIOS DE CENTRO DE CUSTO (template + linhas com %) ----------
CREATE OR ALTER VIEW dbo.v_p2p_cc_rateios AS
SELECT 'GUESS' AS empresa, RTRIM(r.RATEIO_CENTRO_CUSTO) AS rateio_codigo,
       RTRIM(r.DESC_RATEIO_CENTRO_CUSTO) AS rateio_descricao, r.INATIVO AS rateio_inativo,
       RTRIM(i.CENTRO_CUSTO) AS centro_custo_codigo, RTRIM(i.COD_FILIAL) AS filial_codigo,
       i.PORCENTAGEM AS porcentagem
FROM GUESS_PRODUCAO.dbo.CTB_CENTRO_CUSTO_RATEIO r
JOIN GUESS_PRODUCAO.dbo.CTB_CENTRO_CUSTO_RATEIO_ITEM i ON i.RATEIO_CENTRO_CUSTO = r.RATEIO_CENTRO_CUSTO
UNION ALL
SELECT 'HERING', RTRIM(r.RATEIO_CENTRO_CUSTO), RTRIM(r.DESC_RATEIO_CENTRO_CUSTO), r.INATIVO,
       RTRIM(i.CENTRO_CUSTO), RTRIM(i.COD_FILIAL), i.PORCENTAGEM
FROM DB_HRG3.dbo.CTB_CENTRO_CUSTO_RATEIO r
JOIN DB_HRG3.dbo.CTB_CENTRO_CUSTO_RATEIO_ITEM i ON i.RATEIO_CENTRO_CUSTO = r.RATEIO_CENTRO_CUSTO;
GO
