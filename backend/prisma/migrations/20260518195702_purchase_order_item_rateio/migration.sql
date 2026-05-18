BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[purchase_order_item_rateios] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [purchaseOrderItemId] UNIQUEIDENTIFIER NOT NULL,
    [kind] NVARCHAR(15) NOT NULL,
    [rateioCode] NVARCHAR(20) NOT NULL,
    [targetCode] NVARCHAR(20) NOT NULL,
    [branchCode] NVARCHAR(20),
    [percentage] DECIMAL(9,4) NOT NULL,
    [amount] DECIMAL(15,2) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchase_order_item_rateios_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [purchase_order_item_rateios_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_order_item_rateios_purchaseOrderItemId_idx] ON [dbo].[purchase_order_item_rateios]([purchaseOrderItemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_order_item_rateios_kind_targetCode_idx] ON [dbo].[purchase_order_item_rateios]([kind], [targetCode]);

-- AddForeignKey
ALTER TABLE [dbo].[purchase_order_item_rateios] ADD CONSTRAINT [purchase_order_item_rateios_purchaseOrderItemId_fkey] FOREIGN KEY ([purchaseOrderItemId]) REFERENCES [dbo].[purchase_order_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
