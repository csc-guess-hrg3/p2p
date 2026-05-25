-- Coluna canSwitchEnv: permite Admin liberar PROD↔HML para usuários
-- não-Admin específicos (ex.: equipe de QA). Default false.
ALTER TABLE [dbo].[users]
  ADD [canSwitchEnv] BIT NOT NULL CONSTRAINT [DF_users_canSwitchEnv] DEFAULT 0;
