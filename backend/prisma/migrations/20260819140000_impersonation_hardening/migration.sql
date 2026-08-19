-- Endurecimento da simulação de login (revisão adversarial). Aditiva/idempotente.
--  1) audit_logs: passa a auditar TODA mutação autenticada — companyId e entityId
--     viram NULLable e ganha entityRef (identificador de negócio p/ recursos sem GUID:
--     pedido, code, key, chave...). Sem isso, aprovar/rejeitar e aprovar PA (ações
--     mais sensíveis, uso primário "simular gestor") não geravam nenhuma linha.
--  2) users.activeImpersonationSessionId: torna a simulação REVOGÁVEL. O token de
--     simulação carrega o sessionId; sair (ou re-simular) troca/limpa o id no admin,
--     e a strategy/refresh recusam um token cujo sessionId não é o atual — fecha o
--     "refresh reabre a simulação" e a janela do admin revogado.

EXEC sp_executesql N'
IF COLUMNPROPERTY(OBJECT_ID(''dbo.audit_logs''), ''entityId'', ''AllowsNull'') = 0
  ALTER TABLE [dbo].[audit_logs] ALTER COLUMN [entityId] UNIQUEIDENTIFIER NULL;
';

EXEC sp_executesql N'
IF COLUMNPROPERTY(OBJECT_ID(''dbo.audit_logs''), ''companyId'', ''AllowsNull'') = 0
  ALTER TABLE [dbo].[audit_logs] ALTER COLUMN [companyId] UNIQUEIDENTIFIER NULL;
';

EXEC sp_executesql N'
IF COL_LENGTH(''dbo.audit_logs'', ''entityRef'') IS NULL
  ALTER TABLE [dbo].[audit_logs] ADD [entityRef] NVARCHAR(200) NULL;
';

EXEC sp_executesql N'
IF COL_LENGTH(''dbo.users'', ''activeImpersonationSessionId'') IS NULL
  ALTER TABLE [dbo].[users] ADD [activeImpersonationSessionId] NVARCHAR(36) NULL;
';
