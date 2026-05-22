-- Adiciona vínculo com o time autorizado a reagendar pedidos PA.
-- ERP não preenche REQUERIDO_POR no fluxo de PA, então a permissão de
-- reagendamento é controlada por time configurado aqui (+ ADMIN sempre).

ALTER TABLE [dbo].[company_erp_configs]
  ADD [paReschedulerTeamId] UNIQUEIDENTIFIER NULL;

ALTER TABLE [dbo].[company_erp_configs]
  ADD CONSTRAINT [FK_company_erp_configs_paReschedulerTeam]
    FOREIGN KEY ([paReschedulerTeamId]) REFERENCES [dbo].[teams]([id]);
