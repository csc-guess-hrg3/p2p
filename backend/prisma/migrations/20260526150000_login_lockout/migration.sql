-- Proteção contra força bruta no login (PRD: acesso externo via internet).
-- Janelas crescentes de bloqueio: 5 falhas → 15min, 10 → 1h, 15 → 24h.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.users'') AND name = ''failedLoginAttempts'')
BEGIN
  ALTER TABLE [dbo].[users]
    ADD [failedLoginAttempts] INT NOT NULL
        CONSTRAINT [DF_users_failedLoginAttempts] DEFAULT 0,
        [lockedUntil]          DATETIME2 NULL,
        [lastFailedLoginAt]    DATETIME2 NULL;
END;
';
