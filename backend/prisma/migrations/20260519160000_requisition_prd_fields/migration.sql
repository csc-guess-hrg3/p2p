BEGIN TRY

BEGIN TRAN;

-- Alinhamento da requisição ao PRD (Seção 7.1):
-- remove o campo "neededBy" (não previsto) e adiciona condição de
-- pagamento, recorrência e contrato vinculado.

-- DropColumn
ALTER TABLE [dbo].[requisitions] DROP COLUMN [neededBy];

-- AddColumn
ALTER TABLE [dbo].[requisitions] ADD
    [paymentConditionCode] NVARCHAR(20),
    [paymentConditionDesc] NVARCHAR(100),
    [recurring] BIT NOT NULL CONSTRAINT [requisitions_recurring_df] DEFAULT 0,
    [recurrenceMonths] INT,
    [contractRef] NVARCHAR(100);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
