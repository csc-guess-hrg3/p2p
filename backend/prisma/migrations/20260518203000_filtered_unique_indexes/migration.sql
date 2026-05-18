-- SQL Server: uma UNIQUE KEY comum permite apenas UM registro com NULL.
-- Isso quebra ao haver, p.ex., 2 pedidos de compra com erpStagingId nulo.
-- Trocamos as constraints das colunas anuláveis por índices FILTRADOS
-- (WHERE col IS NOT NULL): a unicidade vale só para valores preenchidos.

ALTER TABLE [dbo].[purchase_orders] DROP CONSTRAINT [purchase_orders_erpStagingId_key];
CREATE UNIQUE INDEX [purchase_orders_erpStagingId_key]
  ON [dbo].[purchase_orders]([erpStagingId])
  WHERE [erpStagingId] IS NOT NULL;

ALTER TABLE [dbo].[fund_requests] DROP CONSTRAINT [fund_requests_erpStagingId_key];
CREATE UNIQUE INDEX [fund_requests_erpStagingId_key]
  ON [dbo].[fund_requests]([erpStagingId])
  WHERE [erpStagingId] IS NOT NULL;

ALTER TABLE [dbo].[fund_requests] DROP CONSTRAINT [fund_requests_requisitionId_key];
CREATE UNIQUE INDEX [fund_requests_requisitionId_key]
  ON [dbo].[fund_requests]([requisitionId])
  WHERE [requisitionId] IS NOT NULL;

ALTER TABLE [dbo].[fund_requests] DROP CONSTRAINT [fund_requests_purchaseOrderId_key];
CREATE UNIQUE INDEX [fund_requests_purchaseOrderId_key]
  ON [dbo].[fund_requests]([purchaseOrderId])
  WHERE [purchaseOrderId] IS NOT NULL;
