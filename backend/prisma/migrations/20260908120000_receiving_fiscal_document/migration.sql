-- Camada 2 do recebimento: vínculo Recebimento -> Nota Fiscal (fiscal_documents).
-- Coluna nullable (nem toda entrega chega já com a nota no P2P) + índice + FK.
-- Idempotente: pode rodar mais de uma vez sem erro (aplicação manual em PROD).

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.receivings') AND name = 'fiscalDocumentId'
)
BEGIN
  ALTER TABLE dbo.receivings ADD fiscalDocumentId UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'receivings_fiscalDocumentId_idx'
    AND object_id = OBJECT_ID('dbo.receivings')
)
BEGIN
  CREATE INDEX receivings_fiscalDocumentId_idx ON dbo.receivings(fiscalDocumentId);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'receivings_fiscalDocumentId_fkey'
)
BEGIN
  ALTER TABLE dbo.receivings
    ADD CONSTRAINT receivings_fiscalDocumentId_fkey
    FOREIGN KEY (fiscalDocumentId) REFERENCES dbo.fiscal_documents(id)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END;
GO
