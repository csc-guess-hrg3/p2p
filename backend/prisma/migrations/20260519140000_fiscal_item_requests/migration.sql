BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[teams] ADD [isFiscal] BIT NOT NULL CONSTRAINT [teams_isFiscal_df] DEFAULT 0;

-- CreateTable
CREATE TABLE [dbo].[fiscal_item_requests] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(10) NOT NULL,
    [status] NVARCHAR(15) NOT NULL CONSTRAINT [fiscal_item_requests_status_df] DEFAULT 'PENDING',
    [supplierErpCode] NVARCHAR(50) NOT NULL,
    [supplierName] NVARCHAR(255) NOT NULL,
    [itemErpCode] NVARCHAR(50),
    [itemDescription] NVARCHAR(255) NOT NULL,
    [unit] NVARCHAR(20),
    [requestedById] UNIQUEIDENTIFIER NOT NULL,
    [resolvedById] UNIQUEIDENTIFIER,
    [resolvedAt] DATETIME2,
    [rejectionReason] NVARCHAR(max),
    [notes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [fiscal_item_requests_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fiscal_item_requests_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [fiscal_item_requests_companyId_status_idx] ON [dbo].[fiscal_item_requests]([companyId], [status]);

-- AddForeignKey
ALTER TABLE [dbo].[fiscal_item_requests] ADD CONSTRAINT [fiscal_item_requests_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fiscal_item_requests] ADD CONSTRAINT [fiscal_item_requests_requestedById_fkey] FOREIGN KEY ([requestedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fiscal_item_requests] ADD CONSTRAINT [fiscal_item_requests_resolvedById_fkey] FOREIGN KEY ([resolvedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
