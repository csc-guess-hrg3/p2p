-- CC principal por equipe: marca 1+ centros de custo da equipe como o foco
-- padrão das telas. Idempotente (ADD COLUMN só se não existir).
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.team_cost_center_rateios')
    AND name = 'isPrimary'
)
BEGIN
  ALTER TABLE [dbo].[team_cost_center_rateios]
    ADD [isPrimary] BIT NOT NULL
        CONSTRAINT [DF_team_cc_rateios_isPrimary] DEFAULT 0;
END
