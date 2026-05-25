-- Substitui a abordagem por flag única (isPurchasing) por uma tabela N:N
-- de módulos liberados por equipe. Admin pode liberar PA, FISCAL_QUEUE,
-- REPORTS, RECEIVING, APPROVALS para qualquer equipe — destrava o módulo
-- para os membros, independente do perfil.

CREATE TABLE [dbo].[team_module_access] (
  [teamId]    UNIQUEIDENTIFIER NOT NULL,
  [module]    NVARCHAR(40)     NOT NULL,
  [createdAt] DATETIME2        NOT NULL CONSTRAINT [DF_team_module_access_createdAt] DEFAULT GETDATE(),
  CONSTRAINT [PK_team_module_access] PRIMARY KEY ([teamId], [module]),
  CONSTRAINT [FK_team_module_access_team] FOREIGN KEY ([teamId])
    REFERENCES [dbo].[teams]([id]) ON DELETE CASCADE ON UPDATE NO ACTION
);

-- Migra equipes que estavam com isPurchasing=1 para o módulo PA.
IF COL_LENGTH('dbo.teams', 'isPurchasing') IS NOT NULL
BEGIN
  INSERT INTO [dbo].[team_module_access] ([teamId], [module])
  SELECT [id], 'PA' FROM [dbo].[teams] WHERE [isPurchasing] = 1;

  IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_teams_isPurchasing')
    ALTER TABLE [dbo].[teams] DROP CONSTRAINT [DF_teams_isPurchasing];
  ALTER TABLE [dbo].[teams] DROP COLUMN [isPurchasing];
END
