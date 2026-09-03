-- Controle Orçamentário (André/OBS-03): configuração por empresa — liga/desliga
-- o controle + política no estouro (INFORMATIVE=avisa, BLOCKING=impede).
-- Aditiva e idempotente. Não toca no ERP (só o P2P_DB).
EXEC sp_executesql N'
IF OBJECT_ID(''dbo.budget_control_configs'', ''U'') IS NULL
BEGIN
  CREATE TABLE [dbo].[budget_control_configs] (
    [id]        UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT [budget_control_configs_pkey] PRIMARY KEY CLUSTERED,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [enabled]   BIT NOT NULL CONSTRAINT [DF_bcc_enabled] DEFAULT 0,
    [policy]    NVARCHAR(15) NOT NULL
      CONSTRAINT [DF_bcc_policy] DEFAULT ''INFORMATIVE'',
    [createdAt] DATETIME2 NOT NULL
      CONSTRAINT [DF_bcc_createdAt] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL
      CONSTRAINT [DF_bcc_updatedAt] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [budget_control_configs_companyId_key]
      UNIQUE NONCLUSTERED ([companyId]),
    CONSTRAINT [budget_control_configs_companyId_fkey]
      FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION
  );
END;
';
