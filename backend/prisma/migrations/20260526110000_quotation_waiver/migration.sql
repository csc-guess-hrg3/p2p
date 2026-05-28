-- Dispensa de cotação (RN-REQ-02 — exceção). Permite ao solicitante
-- pular a exigência de 3 cotações alegando motivo aplicável (recorrente,
-- contrato vigente, único fornecedor, emergência, outro). O aprovador
-- visualiza motivo + justificativa antes de decidir.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.requisitions'') AND name = ''quotationWaiverReason'')
BEGIN
  ALTER TABLE [dbo].[requisitions] ADD [quotationWaiverReason] NVARCHAR(30) NULL;
END;
';

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.requisitions'') AND name = ''quotationWaiverNote'')
BEGIN
  ALTER TABLE [dbo].[requisitions] ADD [quotationWaiverNote] NVARCHAR(MAX) NULL;
END;
';

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.requisitions'') AND name = ''quotationWaiverAt'')
BEGIN
  ALTER TABLE [dbo].[requisitions] ADD [quotationWaiverAt] DATETIME2 NULL;
END;
';
