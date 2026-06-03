-- Sync-back financeiro (mão de volta do pagamento) — PRD §11.
-- Eixo ORTOGONAL ao status operacional: registra Faturado/Pago lido do
-- Linx (entradas de NF + saldo do título / saldo da SV).
-- Idempotente (IF NOT EXISTS) — seguro pra rodar em HML e PROD.

-- ── purchase_orders ──
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''financialStatus'' AND Object_ID = Object_ID(''dbo.purchase_orders''))
BEGIN
  ALTER TABLE [dbo].[purchase_orders]
    ADD [financialStatus] NVARCHAR(20) NOT NULL CONSTRAINT [DF_purchase_orders_financialStatus] DEFAULT ''PENDENTE'';
END;
';
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''invoicedAt'' AND Object_ID = Object_ID(''dbo.purchase_orders''))
BEGIN
  ALTER TABLE [dbo].[purchase_orders] ADD [invoicedAt] DATETIME2 NULL;
END;
';
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''paidAt'' AND Object_ID = Object_ID(''dbo.purchase_orders''))
BEGIN
  ALTER TABLE [dbo].[purchase_orders] ADD [paidAt] DATETIME2 NULL;
END;
';
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''financialSyncedAt'' AND Object_ID = Object_ID(''dbo.purchase_orders''))
BEGIN
  ALTER TABLE [dbo].[purchase_orders] ADD [financialSyncedAt] DATETIME2 NULL;
END;
';

-- ── fund_requests ──
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''financialStatus'' AND Object_ID = Object_ID(''dbo.fund_requests''))
BEGIN
  ALTER TABLE [dbo].[fund_requests]
    ADD [financialStatus] NVARCHAR(20) NOT NULL CONSTRAINT [DF_fund_requests_financialStatus] DEFAULT ''PENDENTE'';
END;
';
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''paidAt'' AND Object_ID = Object_ID(''dbo.fund_requests''))
BEGIN
  ALTER TABLE [dbo].[fund_requests] ADD [paidAt] DATETIME2 NULL;
END;
';
EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''financialSyncedAt'' AND Object_ID = Object_ID(''dbo.fund_requests''))
BEGIN
  ALTER TABLE [dbo].[fund_requests] ADD [financialSyncedAt] DATETIME2 NULL;
END;
';
