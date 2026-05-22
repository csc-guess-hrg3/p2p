-- Tabela de log/idempotência de notificações ao aprovador de PA.
-- O cron lê COMPRAS em status 'E' e, pra cada pedido sem entrada aqui,
-- dispara o e-mail ao diretor e grava (success=1) ou (success=0 + retry).

CREATE TABLE [dbo].[pa_approval_notifications] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_pa_apprv_notif_id] DEFAULT NEWID(),
  [companyId] UNIQUEIDENTIFIER NOT NULL,
  [pedido] NVARCHAR(20) NOT NULL,
  [approverEmail] NVARCHAR(255) NOT NULL,
  [firstAttempt] DATETIME2 NOT NULL CONSTRAINT [DF_pa_apprv_notif_first] DEFAULT SYSUTCDATETIME(),
  [lastAttempt] DATETIME2 NOT NULL CONSTRAINT [DF_pa_apprv_notif_last] DEFAULT SYSUTCDATETIME(),
  [attemptCount] INT NOT NULL CONSTRAINT [DF_pa_apprv_notif_attempts] DEFAULT 1,
  [success] BIT NOT NULL CONSTRAINT [DF_pa_apprv_notif_success] DEFAULT 0,
  [errorMessage] NVARCHAR(500) NULL,
  CONSTRAINT [PK_pa_approval_notifications] PRIMARY KEY ([id]),
  CONSTRAINT [UQ_pa_apprv_notif_company_pedido] UNIQUE ([companyId], [pedido])
);
