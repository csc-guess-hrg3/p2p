-- Campos de auditoria pra edição e revisão de requisição/PC.
-- Requisição ganha "REVISION" como status válido (somente no app — banco
-- guarda como NVarChar livre); aprovador devolve a req com motivo, e o
-- requisitante edita pra ressubmeter.
--
-- Histórico granular fica em audit_logs (já gravado pelo interceptor).

ALTER TABLE [dbo].[requisitions]
  ADD [revisionReason] NVARCHAR(MAX) NULL,
      [revisionRequestedAt] DATETIME2 NULL,
      [revisionRequestedById] UNIQUEIDENTIFIER NULL,
      [lastEditReason] NVARCHAR(MAX) NULL,
      [lastEditedAt] DATETIME2 NULL,
      [lastEditedById] UNIQUEIDENTIFIER NULL;

ALTER TABLE [dbo].[purchase_orders]
  ADD [lastEditReason] NVARCHAR(MAX) NULL,
      [lastEditedAt] DATETIME2 NULL,
      [lastEditedById] UNIQUEIDENTIFIER NULL;
