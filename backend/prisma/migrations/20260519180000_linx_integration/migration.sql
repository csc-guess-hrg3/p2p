BEGIN TRY

BEGIN TRAN;

-- =====================================================================
-- Integração com o ERP Linx — gravação do Pedido de Compra
--
-- 1) Adiciona campos de classificação Linx na requisição
--    (tipoCompra, ctbTipoOperacao, naturezaEntrada)
-- 2) Cria company_erp_configs (1:1 com companies) com defaults por
--    empresa: COD_TRANSACAO, TABELA_FILHA, TIPO_COMPRA, CTB_TIPO_OPERACAO,
--    NATUREZA_ENTRADA e SMTP.
-- =====================================================================

ALTER TABLE [dbo].[requisitions] ADD
    [tipoCompra]      NVARCHAR(25),
    [ctbTipoOperacao] INT,
    [naturezaEntrada] NVARCHAR(15);

CREATE TABLE [dbo].[company_erp_configs] (
    [companyId]              UNIQUEIDENTIFIER NOT NULL,
    [codTransacao]           NVARCHAR(25)     NOT NULL,
    [tabelaFilha]            NVARCHAR(25)     NOT NULL,
    [tipoCompraDefault]      NVARCHAR(25)     NOT NULL,
    [ctbTipoOperacaoDefault] INT              NOT NULL,
    [naturezaEntradaDefault] NVARCHAR(15)     NOT NULL,
    [moeda]                  NVARCHAR(6)      NOT NULL CONSTRAINT [company_erp_configs_moeda_df] DEFAULT N'R$',
    [transportadoraPadrao]   NVARCHAR(25),
    [smtpHost]               NVARCHAR(255),
    [smtpPort]               INT,
    [smtpUser]               NVARCHAR(255),
    [smtpPassword]           NVARCHAR(500),
    [smtpSecure]             BIT              NOT NULL CONSTRAINT [company_erp_configs_smtpSecure_df] DEFAULT 0,
    [smtpFrom]               NVARCHAR(255),
    [smtpFromName]           NVARCHAR(255),
    [emailSubjectTemplate]   NVARCHAR(255),
    [emailBodyTemplate]      NVARCHAR(MAX),
    [createdAt]              DATETIME2        NOT NULL CONSTRAINT [company_erp_configs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt]              DATETIME2        NOT NULL,
    CONSTRAINT [company_erp_configs_pkey] PRIMARY KEY ([companyId]),
    CONSTRAINT [company_erp_configs_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
