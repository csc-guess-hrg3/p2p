-- Flag intermediária — substituída pelo modelo TeamModuleAccess na migration
-- seguinte. Mantida por integridade do histórico de _prisma_migrations.
ALTER TABLE [dbo].[teams]
  ADD [isPurchasing] BIT NOT NULL CONSTRAINT [DF_teams_isPurchasing] DEFAULT 0;
