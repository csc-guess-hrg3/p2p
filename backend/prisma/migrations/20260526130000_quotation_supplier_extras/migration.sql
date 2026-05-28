-- Dados públicos do CNPJ (BrasilAPI) cacheados na cotação. Usados pra
-- criação automática do fornecedor no ERP quando a cotação vencedora
-- tem supplier ainda não cadastrado.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.quotations'') AND name = ''supplierFantasia'')
BEGIN
  ALTER TABLE [dbo].[quotations]
    ADD [supplierFantasia]   NVARCHAR(200) NULL,
        [supplierEmail]      NVARCHAR(200) NULL,
        [supplierTelefone]   NVARCHAR(50)  NULL,
        [supplierLogradouro] NVARCHAR(200) NULL,
        [supplierNumero]     NVARCHAR(20)  NULL,
        [supplierBairro]     NVARCHAR(100) NULL,
        [supplierCidade]     NVARCHAR(100) NULL,
        [supplierUf]         NVARCHAR(2)   NULL,
        [supplierCep]        NVARCHAR(10)  NULL,
        [supplierCnae]       NVARCHAR(200) NULL;
END;
';
