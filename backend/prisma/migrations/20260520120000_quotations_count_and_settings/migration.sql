BEGIN TRY

BEGIN TRAN;

-- RN-REQ-02 / REQ-08: número de cotações exigidas para requisições acima de
-- um valor parametrizável (system_settings). O campo abaixo guarda quantas
-- cotações o solicitante anexou; o threshold e o mínimo exigido vivem em
-- SystemSetting (chaves requisitions.min_quotations_*).
--
-- Quando o upload de anexos estiver pronto, esta contagem passará a ser
-- recomputada a partir da relação `attachments` (kind = QUOTATION) por
-- trigger ou em código.

ALTER TABLE [dbo].[requisitions] ADD
    [quotationsCount] INT NOT NULL CONSTRAINT [requisitions_quotationsCount_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
