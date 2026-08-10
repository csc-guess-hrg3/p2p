-- Cutover Fase 1 — discriminador de origem nos pedidos.
--   origin        = 'P2P' (default) | 'EXTERNO' (importado do Linx).
--   teamId        = escopo de equipe próprio do PO (externos não têm requisição).
--   requisitionId = vira NULLABLE (pedidos EXTERNO não nascem de requisição P2P).
-- Idempotente (IF NOT EXISTS / checagens) — aditivo e retrocompatível; o default
-- 'P2P' deixa todos os pedidos nativos existentes corretos sem backfill.

-- 1) origin
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''origin'' AND Object_ID = Object_ID(''dbo.purchase_orders''))
BEGIN
  ALTER TABLE [dbo].[purchase_orders]
    ADD [origin] NVARCHAR(10) NOT NULL
        CONSTRAINT [DF_purchase_orders_origin] DEFAULT ''P2P'';
END;
';

-- 2) teamId (escopo de equipe próprio do PO)
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''teamId'' AND Object_ID = Object_ID(''dbo.purchase_orders''))
BEGIN
  ALTER TABLE [dbo].[purchase_orders] ADD [teamId] UNIQUEIDENTIFIER NULL;
END;
';

-- 3) requisitionId -> NULLABLE (drop FK, alter, recreate FK preservando NoAction)
EXEC sp_executesql N'
IF EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''requisitionId'' AND Object_ID = Object_ID(''dbo.purchase_orders'')
     AND is_nullable = 0)
BEGIN
  IF EXISTS (SELECT 1 FROM sys.foreign_keys
     WHERE name = ''purchase_orders_requisitionId_fkey''
       AND parent_object_id = Object_ID(''dbo.purchase_orders''))
    ALTER TABLE [dbo].[purchase_orders]
      DROP CONSTRAINT [purchase_orders_requisitionId_fkey];

  ALTER TABLE [dbo].[purchase_orders]
    ALTER COLUMN [requisitionId] UNIQUEIDENTIFIER NULL;

  ALTER TABLE [dbo].[purchase_orders]
    ADD CONSTRAINT [purchase_orders_requisitionId_fkey]
    FOREIGN KEY ([requisitionId]) REFERENCES [dbo].[requisitions]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END;
';

-- 4) índices (origin + idempotência do import por erpPedido)
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.indexes
   WHERE name = ''purchase_orders_origin_idx''
     AND object_id = Object_ID(''dbo.purchase_orders''))
  CREATE INDEX [purchase_orders_origin_idx]
    ON [dbo].[purchase_orders]([origin]);
';

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.indexes
   WHERE name = ''purchase_orders_companyId_erpPedido_idx''
     AND object_id = Object_ID(''dbo.purchase_orders''))
  CREATE INDEX [purchase_orders_companyId_erpPedido_idx]
    ON [dbo].[purchase_orders]([companyId],[erpPedido]);
';
