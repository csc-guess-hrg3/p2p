-- Cotações (propostas de fornecedores anexadas à requisição).
-- Cada cotação tem um anexo opcional (PDF), o CNPJ do fornecedor,
-- condição de pagamento, e uma lista de itens (qty + unit price).
-- O aprovador pode selecionar uma cotação como vencedora — isso
-- sobrescreve fornecedor + condição + itens da requisição original.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.requisitions'') AND name = ''winningQuotationId'')
BEGIN
  ALTER TABLE [dbo].[requisitions] ADD [winningQuotationId] UNIQUEIDENTIFIER NULL;
END;
';

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.requisitions'') AND name = ''winningQuotationNeedsErp'')
BEGIN
  ALTER TABLE [dbo].[requisitions]
    ADD [winningQuotationNeedsErp] BIT NOT NULL
    CONSTRAINT [DF_requisitions_winningNeedsErp] DEFAULT 0;
END;
';

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = ''quotations'')
BEGIN
  CREATE TABLE [dbo].[quotations] (
    [id]                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT [PK_quotations] PRIMARY KEY DEFAULT NEWID(),
    [companyId]             UNIQUEIDENTIFIER NOT NULL,
    [requisitionId]         UNIQUEIDENTIFIER NOT NULL,
    [attachmentId]          UNIQUEIDENTIFIER NULL,
    [supplierCnpj]          NVARCHAR(14) NOT NULL,
    [supplierName]          NVARCHAR(200) NOT NULL,
    [supplierErpCode]       NVARCHAR(20) NULL,
    [paymentConditionCode]  NVARCHAR(20) NULL,
    [paymentConditionDesc]  NVARCHAR(100) NULL,
    [totalAmount]           DECIMAL(18, 2) NOT NULL,
    [notes]                 NVARCHAR(MAX) NULL,
    [isWinner]              BIT NOT NULL CONSTRAINT [DF_quotations_isWinner] DEFAULT 0,
    [selectedAt]            DATETIME2 NULL,
    [selectedById]          UNIQUEIDENTIFIER NULL,
    [createdAt]             DATETIME2 NOT NULL CONSTRAINT [DF_quotations_createdAt] DEFAULT SYSUTCDATETIME(),
    [createdById]           UNIQUEIDENTIFIER NOT NULL
  );

  CREATE UNIQUE INDEX [UQ_quotations_attachmentId] ON [dbo].[quotations]([attachmentId]) WHERE [attachmentId] IS NOT NULL;
  CREATE INDEX [IX_quotations_requisitionId] ON [dbo].[quotations]([requisitionId]);
  CREATE INDEX [IX_quotations_supplierCnpj] ON [dbo].[quotations]([supplierCnpj]);

  ALTER TABLE [dbo].[quotations] ADD CONSTRAINT [FK_quotations_requisition]
    FOREIGN KEY ([requisitionId]) REFERENCES [dbo].[requisitions]([id]);
  ALTER TABLE [dbo].[quotations] ADD CONSTRAINT [FK_quotations_attachment]
    FOREIGN KEY ([attachmentId]) REFERENCES [dbo].[attachments]([id]);
  ALTER TABLE [dbo].[quotations] ADD CONSTRAINT [FK_quotations_createdBy]
    FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]);
  ALTER TABLE [dbo].[quotations] ADD CONSTRAINT [FK_quotations_selectedBy]
    FOREIGN KEY ([selectedById]) REFERENCES [dbo].[users]([id]);
END;
';

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = ''quotation_items'')
BEGIN
  CREATE TABLE [dbo].[quotation_items] (
    [id]           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [PK_quotation_items] PRIMARY KEY DEFAULT NEWID(),
    [quotationId]  UNIQUEIDENTIFIER NOT NULL,
    [position]     INT NOT NULL,
    [description]  NVARCHAR(500) NOT NULL,
    [unit]         NVARCHAR(20) NULL,
    [quantity]     DECIMAL(18, 4) NOT NULL,
    [unitPrice]    DECIMAL(18, 4) NOT NULL,
    [totalPrice]   DECIMAL(18, 2) NOT NULL
  );

  CREATE INDEX [IX_quotation_items_quotationId] ON [dbo].[quotation_items]([quotationId]);

  ALTER TABLE [dbo].[quotation_items] ADD CONSTRAINT [FK_quotation_items_quotation]
    FOREIGN KEY ([quotationId]) REFERENCES [dbo].[quotations]([id]) ON DELETE CASCADE;
END;
';
