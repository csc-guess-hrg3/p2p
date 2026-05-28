-- Requisição passa a aceitar fornecedor EXTERNO (CNPJ ainda não
-- cadastrado no Linx). Quando aprovada, o sistema cria automaticamente
-- o fornecedor no ERP usando os dados públicos (BrasilAPI) capturados
-- aqui.
--
-- Mudanças:
--   1) `supplierErpCode` vira NULL (era NOT NULL) — requisições com
--      fornecedor externo não têm código de ERP até a criação.
--   2) Novas colunas com dados públicos do fornecedor (mesmo padrão da
--      tabela `quotations`).
--   3) Flag `needsSupplierErpCreation` substituindo o legacy
--      `winningQuotationNeedsErp` (caso era específico — agora unifica
--      cotação vencedora externa + req com fornecedor externo direto).

-- 1) supplierErpCode nullable
EXEC sp_executesql N'
IF EXISTS (
  SELECT 1 FROM sys.columns c
  JOIN sys.types t ON t.user_type_id = c.user_type_id
  WHERE c.object_id = OBJECT_ID(''dbo.requisitions'')
    AND c.name = ''supplierErpCode''
    AND c.is_nullable = 0
)
BEGIN
  ALTER TABLE [dbo].[requisitions] ALTER COLUMN [supplierErpCode] NVARCHAR(50) NULL;
END;
';

-- 2) Colunas novas
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.requisitions'') AND name = ''supplierCnpj'')
BEGIN
  ALTER TABLE [dbo].[requisitions]
    ADD [supplierCnpj]        NVARCHAR(14)  NULL,
        [supplierFantasia]    NVARCHAR(200) NULL,
        [supplierEmail]       NVARCHAR(200) NULL,
        [supplierTelefone]    NVARCHAR(50)  NULL,
        [supplierLogradouro]  NVARCHAR(200) NULL,
        [supplierNumero]      NVARCHAR(20)  NULL,
        [supplierBairro]      NVARCHAR(100) NULL,
        [supplierCidade]      NVARCHAR(100) NULL,
        [supplierUf]          NVARCHAR(2)   NULL,
        [supplierCep]         NVARCHAR(10)  NULL,
        [supplierCnae]        NVARCHAR(200) NULL,
        [needsSupplierErpCreation] BIT NOT NULL
          CONSTRAINT [DF_requisitions_needsSupErp] DEFAULT 0;
END;
';

-- 3) Migra o valor do legacy winningQuotationNeedsErp pra o novo
--    needsSupplierErpCreation, depois remove a coluna antiga.
EXEC sp_executesql N'
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.requisitions'') AND name = ''winningQuotationNeedsErp'')
BEGIN
  UPDATE [dbo].[requisitions]
     SET [needsSupplierErpCreation] = [winningQuotationNeedsErp]
   WHERE [winningQuotationNeedsErp] = 1;

  DECLARE @defName SYSNAME;
  SELECT @defName = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
   WHERE c.object_id = OBJECT_ID(''dbo.requisitions'')
     AND c.name = ''winningQuotationNeedsErp'';
  IF @defName IS NOT NULL
    EXEC(''ALTER TABLE [dbo].[requisitions] DROP CONSTRAINT '' + @defName);

  ALTER TABLE [dbo].[requisitions] DROP COLUMN [winningQuotationNeedsErp];
END;
';
