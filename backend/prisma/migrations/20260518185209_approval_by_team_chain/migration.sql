/*
  Warnings:

  - You are about to drop the column `approverId` on the `approval_steps` table. All the data in the column will be lost.
  - You are about to drop the column `tierId` on the `approval_steps` table. All the data in the column will be lost.
  - You are about to drop the column `approvalLimit` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `approval_tiers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_approval_tiers` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `assignedApproverId` to the `approval_steps` table without a default value. This is not possible if the table is not empty.
  - Added the required column `levelName` to the `approval_steps` table without a default value. This is not possible if the table is not empty.

*/
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[approval_steps] DROP CONSTRAINT [approval_steps_approverId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[approval_steps] DROP CONSTRAINT [approval_steps_tierId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[approval_tiers] DROP CONSTRAINT [approval_tiers_companyId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[user_approval_tiers] DROP CONSTRAINT [user_approval_tiers_tierId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[user_approval_tiers] DROP CONSTRAINT [user_approval_tiers_userId_fkey];

-- DropIndex
DROP INDEX [approval_steps_approverId_status_idx] ON [dbo].[approval_steps];

-- AlterTable
ALTER TABLE [dbo].[approval_steps] DROP COLUMN [approverId],
[tierId];
ALTER TABLE [dbo].[approval_steps] ADD [assignedApproverId] UNIQUEIDENTIFIER NOT NULL,
[decidedById] UNIQUEIDENTIFIER,
[levelName] NVARCHAR(50) NOT NULL,
[teamApprovalLevelId] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[teams] ADD [managerId] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[users] DROP COLUMN [approvalLimit];

-- DropTable
DROP TABLE [dbo].[approval_tiers];

-- DropTable
DROP TABLE [dbo].[user_approval_tiers];

-- CreateTable
CREATE TABLE [dbo].[team_approval_levels] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [teamId] UNIQUEIDENTIFIER NOT NULL,
    [level] INT NOT NULL,
    [name] NVARCHAR(50) NOT NULL,
    [approverId] UNIQUEIDENTIFIER NOT NULL,
    [maxAmount] DECIMAL(15,2),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [team_approval_levels_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [team_approval_levels_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [team_approval_levels_teamId_level_key] UNIQUE NONCLUSTERED ([teamId],[level])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_steps_assignedApproverId_status_idx] ON [dbo].[approval_steps]([assignedApproverId], [status]);

-- AddForeignKey
ALTER TABLE [dbo].[teams] ADD CONSTRAINT [teams_managerId_fkey] FOREIGN KEY ([managerId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[team_approval_levels] ADD CONSTRAINT [team_approval_levels_teamId_fkey] FOREIGN KEY ([teamId]) REFERENCES [dbo].[teams]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[team_approval_levels] ADD CONSTRAINT [team_approval_levels_approverId_fkey] FOREIGN KEY ([approverId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_teamApprovalLevelId_fkey] FOREIGN KEY ([teamApprovalLevelId]) REFERENCES [dbo].[team_approval_levels]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_assignedApproverId_fkey] FOREIGN KEY ([assignedApproverId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_decidedById_fkey] FOREIGN KEY ([decidedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
