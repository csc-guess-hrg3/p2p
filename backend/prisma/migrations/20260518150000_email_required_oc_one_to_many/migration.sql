/*
  Mudanças:
  - users.email passa a ser obrigatório (NOT NULL) e único (RN-USR-01).
  - purchase_orders.requisitionId deixa de ser único: 1 requisição pode
    gerar N pedidos de compra (RN-REQ-04).
*/
BEGIN TRY

BEGIN TRAN;

-- DropIndex: requisitionId deixa de ser único na OC
ALTER TABLE [dbo].[purchase_orders] DROP CONSTRAINT [purchase_orders_requisitionId_key];

-- AlterTable: email obrigatório
ALTER TABLE [dbo].[users] ALTER COLUMN [email] NVARCHAR(255) NOT NULL;

-- CreateIndex: email único
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
