BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[requisitions] ADD [teamId] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[users] ADD [teamId] UNIQUEIDENTIFIER;

-- CreateTable
CREATE TABLE [dbo].[teams] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [teams_active_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [teams_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [teams_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[team_branch_rateios] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [teamId] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [branchRateioCode] NVARCHAR(20) NOT NULL,
    CONSTRAINT [team_branch_rateios_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [team_branch_rateios_teamId_companyId_branchRateioCode_key] UNIQUE NONCLUSTERED ([teamId],[companyId],[branchRateioCode])
);

-- CreateTable
CREATE TABLE [dbo].[team_cost_center_rateios] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [teamId] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [costCenterRateioCode] NVARCHAR(20) NOT NULL,
    CONSTRAINT [team_cost_center_rateios_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [team_cost_center_rateios_teamId_companyId_costCenterRateioCode_key] UNIQUE NONCLUSTERED ([teamId],[companyId],[costCenterRateioCode])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [requisitions_teamId_status_idx] ON [dbo].[requisitions]([teamId], [status]);

-- AddForeignKey
ALTER TABLE [dbo].[team_branch_rateios] ADD CONSTRAINT [team_branch_rateios_teamId_fkey] FOREIGN KEY ([teamId]) REFERENCES [dbo].[teams]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[team_branch_rateios] ADD CONSTRAINT [team_branch_rateios_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[team_cost_center_rateios] ADD CONSTRAINT [team_cost_center_rateios_teamId_fkey] FOREIGN KEY ([teamId]) REFERENCES [dbo].[teams]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[team_cost_center_rateios] ADD CONSTRAINT [team_cost_center_rateios_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_teamId_fkey] FOREIGN KEY ([teamId]) REFERENCES [dbo].[teams]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[requisitions] ADD CONSTRAINT [requisitions_teamId_fkey] FOREIGN KEY ([teamId]) REFERENCES [dbo].[teams]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
