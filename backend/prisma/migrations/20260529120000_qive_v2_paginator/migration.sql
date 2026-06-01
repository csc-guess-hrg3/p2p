-- Suporte ao endpoint v2 da Qive (POST /v2/dfe/nfe).
-- A paginação na v2 não é mais um inteiro (cursor) e sim uma string
-- opaca de tamanho variável (Paginator). Adicionamos um campo
-- dedicado e zeramos o cursor pra forçar um re-walk completo na v2
-- (a v1 retornou ~1.3k NFs mas a conta tem ~56k — a v2 vê tudo).

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''lastPaginator''
     AND Object_ID = Object_ID(''dbo.fiscal_document_sync_states''))
BEGIN
  ALTER TABLE [dbo].[fiscal_document_sync_states]
    ADD [lastPaginator] NVARCHAR(1000) NULL;
END;
';

-- Reset cursor + paginator pras NFs antigas serem reavaliadas (a v2
-- traz mais campos e existentes serão puladas por accessKey UNIQUE).
EXEC sp_executesql N'
UPDATE [dbo].[fiscal_document_sync_states]
   SET [lastCursor]    = 0,
       [lastPaginator] = NULL,
       [lastError]     = NULL;
';
