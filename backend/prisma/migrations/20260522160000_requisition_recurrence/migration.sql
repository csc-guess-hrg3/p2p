-- PRD RN-REQ-03: gera requisições filhas automaticamente conforme
-- periodicidade definida.
-- - recurrenceParentId: aponta pra requisição original
-- - nextRecurrenceAt: data agendada da próxima geração

-- ALTER TABLE em separado (Prisma roda o arquivo como 1 batch SQL, sem
-- "GO". A CREATE INDEX abaixo precisa do EXEC sp_executesql pra forçar
-- nova compilação depois das colunas ficarem visíveis).

ALTER TABLE [dbo].[requisitions]
  ADD [recurrenceParentId] UNIQUEIDENTIFIER NULL,
      [nextRecurrenceAt] DATETIME2 NULL;

ALTER TABLE [dbo].[requisitions]
  ADD CONSTRAINT [FK_requisitions_recurrenceParent]
    FOREIGN KEY ([recurrenceParentId]) REFERENCES [dbo].[requisitions]([id]);

EXEC sp_executesql N'CREATE INDEX [IX_requisitions_nextRecurrence]
  ON [dbo].[requisitions] ([nextRecurrenceAt])
  WHERE [nextRecurrenceAt] IS NOT NULL';
