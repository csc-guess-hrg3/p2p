-- Documentos fiscais (NFe/NFSe/CTe) baixados da Qive.
-- Por enquanto: só vínculo manual ao PC. Lançamento no Linx e
-- manifestação ficam pra fase futura.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = ''fiscal_documents'')
BEGIN
  CREATE TABLE [dbo].[fiscal_documents] (
    [id]               UNIQUEIDENTIFIER NOT NULL,
    [companyId]        UNIQUEIDENTIFIER NOT NULL,
    [type]             NVARCHAR(10)     NOT NULL,
    [accessKey]        NVARCHAR(80)     NOT NULL,
    [qiveCursor]       INT              NULL,
    [supplierCnpj]     NVARCHAR(14)     NOT NULL,
    [supplierName]     NVARCHAR(255)    NOT NULL,
    [destCnpj]         NVARCHAR(14)     NOT NULL,
    [destName]         NVARCHAR(255)    NULL,
    [numero]           NVARCHAR(20)     NOT NULL,
    [serie]            NVARCHAR(10)     NULL,
    [natOp]            NVARCHAR(255)    NULL,
    [valorTotal]       DECIMAL(15, 2)   NOT NULL,
    [emissao]          DATETIME2        NOT NULL,
    [status]           NVARCHAR(15)     NOT NULL CONSTRAINT [DF_fiscal_documents_status] DEFAULT ''PENDING'',
    [purchaseOrderId]  UNIQUEIDENTIFIER NULL,
    [linkedById]       UNIQUEIDENTIFIER NULL,
    [linkedAt]         DATETIME2        NULL,
    [notes]            NVARCHAR(MAX)    NULL,
    [rawXmlBase64]     NVARCHAR(MAX)    NOT NULL,
    [itemsJson]        NVARCHAR(MAX)    NULL,
    [createdAt]        DATETIME2        NOT NULL CONSTRAINT [DF_fiscal_documents_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt]        DATETIME2        NOT NULL,
    [deletedAt]        DATETIME2        NULL,
    CONSTRAINT [PK_fiscal_documents] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_fiscal_documents_accessKey] UNIQUE ([accessKey]),
    CONSTRAINT [FK_fiscal_documents_company] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]),
    CONSTRAINT [FK_fiscal_documents_po] FOREIGN KEY ([purchaseOrderId]) REFERENCES [dbo].[purchase_orders]([id]),
    CONSTRAINT [FK_fiscal_documents_linkedBy] FOREIGN KEY ([linkedById]) REFERENCES [dbo].[users]([id])
  );
  CREATE INDEX [IX_fiscal_documents_company_status_emissao] ON [dbo].[fiscal_documents] ([companyId], [status], [emissao]);
  CREATE INDEX [IX_fiscal_documents_supplierCnpj] ON [dbo].[fiscal_documents] ([supplierCnpj]);
  CREATE INDEX [IX_fiscal_documents_purchaseOrderId] ON [dbo].[fiscal_documents] ([purchaseOrderId]);
END;
';

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = ''fiscal_document_sync_states'')
BEGIN
  CREATE TABLE [dbo].[fiscal_document_sync_states] (
    [id]          UNIQUEIDENTIFIER NOT NULL,
    [companyId]   UNIQUEIDENTIFIER NOT NULL,
    [role]        NVARCHAR(20)     NOT NULL,
    [lastCursor]  INT              NOT NULL CONSTRAINT [DF_fiscal_document_sync_lastCursor] DEFAULT 0,
    [lastSyncAt]  DATETIME2        NULL,
    [lastError]   NVARCHAR(MAX)    NULL,
    [createdAt]   DATETIME2        NOT NULL CONSTRAINT [DF_fiscal_document_sync_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt]   DATETIME2        NOT NULL,
    CONSTRAINT [PK_fiscal_document_sync_states] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_fiscal_document_sync_company_role] UNIQUE ([companyId], [role]),
    CONSTRAINT [FK_fiscal_document_sync_company] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id])
  );
END;
';
