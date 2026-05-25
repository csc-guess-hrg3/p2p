-- ApprovalStep.assignedApproverId vira opcional — quando o nível usa
-- aprovador dinâmico (cargo + filial), o step não associa uma pessoa
-- a priori; o engine resolve quem pode decidir no momento da decisão.

-- Derruba a FK pra trocar pra nullable.
DECLARE @fk sysname;
SELECT @fk = fk.name FROM sys.foreign_keys fk
 WHERE fk.parent_object_id = OBJECT_ID('dbo.approval_steps')
   AND OBJECT_NAME(fk.referenced_object_id) = 'users'
   AND fk.name LIKE '%assignedApprover%';
IF @fk IS NOT NULL EXEC('ALTER TABLE [dbo].[approval_steps] DROP CONSTRAINT [' + @fk + ']');

-- Se a FK não tinha esse nome reconhecível, tenta pelo schema dela:
IF @fk IS NULL
BEGIN
  SELECT @fk = fk.name FROM sys.foreign_keys fk
   INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
   INNER JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
   WHERE fk.parent_object_id = OBJECT_ID('dbo.approval_steps')
     AND c.name = 'assignedApproverId';
  IF @fk IS NOT NULL EXEC('ALTER TABLE [dbo].[approval_steps] DROP CONSTRAINT [' + @fk + ']');
END

-- Derruba o índice (NOT NULL é parte do plano dele) também se for filtrado.
DECLARE @ix sysname;
SELECT @ix = name FROM sys.indexes
 WHERE object_id = OBJECT_ID('dbo.approval_steps')
   AND name LIKE '%assignedApproverId%';
IF @ix IS NOT NULL EXEC('DROP INDEX [' + @ix + '] ON [dbo].[approval_steps]');

ALTER TABLE [dbo].[approval_steps] ALTER COLUMN [assignedApproverId] UNIQUEIDENTIFIER NULL;

-- Recria FK + índice.
ALTER TABLE [dbo].[approval_steps]
  ADD CONSTRAINT [FK_approval_steps_assignedApprover]
    FOREIGN KEY ([assignedApproverId])
    REFERENCES [dbo].[users]([id])
    ON UPDATE NO ACTION ON DELETE NO ACTION;

CREATE INDEX [IX_approval_steps_assignedApprover_status]
  ON [dbo].[approval_steps]([assignedApproverId], [status]);
