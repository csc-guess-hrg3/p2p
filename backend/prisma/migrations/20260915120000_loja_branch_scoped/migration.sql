/*
  Conta de loja: escopo de visibilidade por filial.
  Adiciona users.branchScoped (BIT) — true = a conta vê/age no escopo da(s)
  filial(is) do UserBranchAssignment (não own-only). Default 0 (own-only).
*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[users] ADD [branchScoped] BIT NOT NULL CONSTRAINT [users_branchScoped_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
