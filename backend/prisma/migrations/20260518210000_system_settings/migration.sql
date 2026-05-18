BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[system_settings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [key] NVARCHAR(80) NOT NULL,
    [value] NVARCHAR(max) NOT NULL,
    [updatedById] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [system_settings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [system_settings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [system_settings_companyId_key_key] UNIQUE NONCLUSTERED ([companyId],[key])
);

-- AddForeignKey
ALTER TABLE [dbo].[system_settings] ADD CONSTRAINT [system_settings_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[system_settings] ADD CONSTRAINT [system_settings_updatedById_fkey] FOREIGN KEY ([updatedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
