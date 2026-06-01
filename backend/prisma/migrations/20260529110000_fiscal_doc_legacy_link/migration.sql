-- Vincula uma NF a um pedido legado (Linx, pré-P2P).
-- Diferente de purchaseOrderId (que aponta pra PurchaseOrder no P2P),
-- legacyPedido + legacyCompanyId referenciam um COMPRAS.PEDIDO direto
-- no banco do Linx — sem FK porque é cross-database.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = ''legacyPedido''
   AND Object_ID = Object_ID(''dbo.fiscal_documents''))
BEGIN
  ALTER TABLE [dbo].[fiscal_documents]
    ADD [legacyPedido]    NVARCHAR(20)     NULL,
        [legacyCompanyId] UNIQUEIDENTIFIER NULL;
END;
';

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.indexes
   WHERE name = ''IX_fiscal_documents_legacyPedido''
     AND object_id = OBJECT_ID(''dbo.fiscal_documents''))
BEGIN
  CREATE INDEX [IX_fiscal_documents_legacyPedido]
    ON [dbo].[fiscal_documents] ([legacyCompanyId], [legacyPedido]);
END;
';
