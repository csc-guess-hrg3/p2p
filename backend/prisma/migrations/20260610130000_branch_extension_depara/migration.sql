-- De-Para (camada P2P) na filial: override opcional sobre o cadastro do ERP.
--   aliasName = nome amigável exibido no portal (F-02 — renomear filial)
--   hidden    = oculta filiais não-P2P das telas/seletores (F-01)
-- A filial continua referenciada pelo branchErpCode na devolução ao ERP.
-- Idempotente (IF NOT EXISTS) — colunas nullable/default, retrocompatíveis.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''aliasName''
     AND Object_ID = Object_ID(''dbo.branch_extensions''))
BEGIN
  ALTER TABLE [dbo].[branch_extensions] ADD [aliasName] NVARCHAR(200) NULL;
END;
';

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''hidden''
     AND Object_ID = Object_ID(''dbo.branch_extensions''))
BEGIN
  ALTER TABLE [dbo].[branch_extensions] ADD [hidden] BIT NOT NULL CONSTRAINT [DF_branch_extensions_hidden] DEFAULT 0;
END;
';
