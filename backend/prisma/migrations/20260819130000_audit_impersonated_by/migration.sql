-- Simulação de login: coluna impersonatedById em audit_logs.
-- Guarda o ADMIN real quando a ação foi feita "vendo como" o userId
-- (trilha "admin agindo como X"). Aditiva e idempotente — só o P2P_DB,
-- não toca no ERP/Linx.

EXEC sp_executesql N'
IF COL_LENGTH(''dbo.audit_logs'', ''impersonatedById'') IS NULL
  ALTER TABLE [dbo].[audit_logs] ADD [impersonatedById] UNIQUEIDENTIFIER NULL;
';

EXEC sp_executesql N'
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
   WHERE name = ''audit_logs_impersonatedById_createdAt_idx''
     AND object_id = OBJECT_ID(''dbo.audit_logs'')
)
  CREATE INDEX [audit_logs_impersonatedById_createdAt_idx]
    ON [dbo].[audit_logs] ([impersonatedById], [createdAt]);
';
