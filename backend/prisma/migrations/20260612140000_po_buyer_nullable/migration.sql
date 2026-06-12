-- Cutover Fase 1 — buyerId opcional. Pedidos EXTERNO cujo REQUERIDO_POR (login
-- Linx) não casa um User do P2P (raríssimo) ficam com buyerId NULL.
-- Idempotente — drop/recreate da FK preservando NoAction.

EXEC sp_executesql N'
IF EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''buyerId'' AND Object_ID = Object_ID(''dbo.purchase_orders'')
     AND is_nullable = 0)
BEGIN
  IF EXISTS (SELECT 1 FROM sys.foreign_keys
     WHERE name = ''purchase_orders_buyerId_fkey''
       AND parent_object_id = Object_ID(''dbo.purchase_orders''))
    ALTER TABLE [dbo].[purchase_orders]
      DROP CONSTRAINT [purchase_orders_buyerId_fkey];

  ALTER TABLE [dbo].[purchase_orders]
    ALTER COLUMN [buyerId] UNIQUEIDENTIFIER NULL;

  ALTER TABLE [dbo].[purchase_orders]
    ADD CONSTRAINT [purchase_orders_buyerId_fkey]
    FOREIGN KEY ([buyerId]) REFERENCES [dbo].[users]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END;
';
