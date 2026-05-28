-- Adiciona `kind` em attachments pra distinguir cotação/contrato/foto/etc.
-- Necessário pra RN-REQ-02: contar QUOTATION em vez de confiar no campo
-- editável `requisitions.quotationsCount`.
--
-- Cada bloco roda via sp_executesql porque Prisma + SQL Server adapter
-- envia tudo num único batch — sem isso, a coluna recém-criada não é
-- visível para o CREATE INDEX subsequente.

EXEC sp_executesql N'
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(''dbo.attachments'') AND name = ''kind''
)
BEGIN
  ALTER TABLE [dbo].[attachments]
    ADD [kind] NVARCHAR(30) NOT NULL
    CONSTRAINT [DF_attachments_kind] DEFAULT N''OTHER'';
END;
';

EXEC sp_executesql N'
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = ''attachments_requisitionId_kind_idx''
    AND object_id = OBJECT_ID(''dbo.attachments'')
)
BEGIN
  CREATE INDEX [attachments_requisitionId_kind_idx]
    ON [dbo].[attachments]([requisitionId], [kind]);
END;
';
