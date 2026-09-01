-- Validação de fornecedor novo (Revisor) — RN do André (11/jun/2026).
-- Antes da requisição ir pro gestor, fornecedor não cadastrado passa por
-- validação do Revisor (aprovar → cadastra no Linx; devolver → volta).
-- Idempotente (IF NOT EXISTS) — tabela nova, retrocompatível.

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
   WHERE name = 'supplier_validations' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE [dbo].[supplier_validations] (
    [id]              UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [PK_supplier_validations] PRIMARY KEY,
    [companyId]       UNIQUEIDENTIFIER NOT NULL,
    [requisitionId]   UNIQUEIDENTIFIER NOT NULL,
    [status]          NVARCHAR(15) NOT NULL
        CONSTRAINT [DF_supplier_validations_status] DEFAULT 'PENDING',
    [supplierCnpj]    NVARCHAR(14) NOT NULL,
    [supplierErpCode] NVARCHAR(20) NULL,
    [validatorId]     UNIQUEIDENTIFIER NULL,
    [justification]   NVARCHAR(MAX) NULL,
    [decidedAt]       DATETIME2 NULL,
    [createdAt]       DATETIME2 NOT NULL
        CONSTRAINT [DF_supplier_validations_createdAt] DEFAULT SYSUTCDATETIME(),
    [updatedAt]       DATETIME2 NOT NULL,
    CONSTRAINT [UQ_supplier_validations_requisitionId] UNIQUE ([requisitionId]),
    CONSTRAINT [FK_supplier_validations_requisition]
        FOREIGN KEY ([requisitionId]) REFERENCES [dbo].[requisitions]([id])
  );

  CREATE INDEX [IX_supplier_validations_company_status]
      ON [dbo].[supplier_validations]([companyId], [status]);
END;
