-- Modelo novo de recorrência em SÉRIE: carimbo de quando a série (N pedidos)
-- foi gerada, pra o scan não regerar. Idempotente.
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
   WHERE object_id = OBJECT_ID('dbo.requisitions') AND name = 'seriesGeneratedAt'
)
BEGIN
  ALTER TABLE [dbo].[requisitions] ADD [seriesGeneratedAt] DATETIME2 NULL;
END;
