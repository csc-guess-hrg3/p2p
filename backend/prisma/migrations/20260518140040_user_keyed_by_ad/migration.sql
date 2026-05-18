/*
  Warnings:

  - Made the column `adUsername` on table `users` required.
  - Column `email` on `users` and `cnpj` on `companies` deixam de ser unique.

  Ajuste manual: no SQL Server uma coluna com constraint UNIQUE não pode
  ser alterada — o índice é dropado antes do ALTER e recriado depois.
*/
BEGIN TRY

BEGIN TRAN;

-- DropIndex
ALTER TABLE [dbo].[companies] DROP CONSTRAINT [companies_cnpj_key];
ALTER TABLE [dbo].[users] DROP CONSTRAINT [users_email_key];
ALTER TABLE [dbo].[users] DROP CONSTRAINT [users_adUsername_key];

-- AlterTable
ALTER TABLE [dbo].[companies] ALTER COLUMN [cnpj] NVARCHAR(18) NULL;
ALTER TABLE [dbo].[users] ALTER COLUMN [email] NVARCHAR(255) NULL;
ALTER TABLE [dbo].[users] ALTER COLUMN [adUsername] NVARCHAR(255) NOT NULL;

-- CreateIndex (recria o unique de adUsername após o ALTER)
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_adUsername_key] UNIQUE NONCLUSTERED ([adUsername]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
