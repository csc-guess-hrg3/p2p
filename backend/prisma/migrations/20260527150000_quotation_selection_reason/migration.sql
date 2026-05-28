-- Justificativa da escolha da cotação vencedora.
-- Antes a seleção não exigia motivo — agora o aprovador precisa explicar
-- POR QUE escolheu essa cotação em vez das outras (auditoria + RN-REQ-02).

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(''dbo.quotations'') AND name = ''selectionReason'')
BEGIN
  ALTER TABLE [dbo].[quotations]
    ADD [selectionReason] NVARCHAR(MAX) NULL;
END;
';
