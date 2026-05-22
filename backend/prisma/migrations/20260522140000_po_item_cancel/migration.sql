-- PRD RN-OC-03: cancelamento parcial por item.
-- Adiciona cancelledQty/cancelledAt/cancellationReason em
-- PurchaseOrderItem pra permitir cancelar só o saldo não recebido.

ALTER TABLE [dbo].[purchase_order_items]
  ADD [cancelledQty] DECIMAL(15, 4) NOT NULL CONSTRAINT [DF_poi_cancelledQty] DEFAULT 0,
      [cancelledAt] DATETIME2 NULL,
      [cancellationReason] NVARCHAR(500) NULL;
