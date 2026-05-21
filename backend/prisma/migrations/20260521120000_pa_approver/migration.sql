BEGIN TRY

BEGIN TRAN;

-- =====================================================================
-- Pedidos de Produto Acabado (PA) — aprovador por empresa.
-- Decisão: 1 aprovador único por empresa (diretor da marca). Quando o
-- negócio evoluir para alçada por valor, substituir por um vínculo com
-- TeamApprovalLevel (escopo PA). Documentado em DECISIONS.md.
-- =====================================================================

ALTER TABLE [dbo].[company_erp_configs] ADD
    [paApproverUserId] UNIQUEIDENTIFIER;

ALTER TABLE [dbo].[company_erp_configs] ADD
    CONSTRAINT [company_erp_configs_paApproverUserId_fkey]
    FOREIGN KEY ([paApproverUserId]) REFERENCES [dbo].[users]([id]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
