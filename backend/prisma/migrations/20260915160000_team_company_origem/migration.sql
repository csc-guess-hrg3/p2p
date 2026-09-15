/*
  Empresa de ORIGEM da equipe (dona da equipe, tipo a separação do AD).
  Só rótulo/filtro p/ identificar e desambiguar nomes iguais — NÃO restringe onde
  a equipe opera (rateios seguem multi-empresa). Nullable; backfill à parte.
*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[teams] ADD [companyId] UNIQUEIDENTIFIER NULL;

-- AddForeignKey
ALTER TABLE [dbo].[teams] ADD CONSTRAINT [teams_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
