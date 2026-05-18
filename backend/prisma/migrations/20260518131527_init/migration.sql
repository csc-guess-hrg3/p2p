BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[companies] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [code] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [cnpj] NVARCHAR(18) NOT NULL,
    [erpDbName] NVARCHAR(100) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [companies_active_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [companies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [companies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [companies_code_key] UNIQUE NONCLUSTERED ([code]),
    CONSTRAINT [companies_cnpj_key] UNIQUE NONCLUSTERED ([cnpj])
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [email] NVARCHAR(255) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [adUsername] NVARCHAR(255),
    [profile] NVARCHAR(20) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [users_status_df] DEFAULT 'PENDING_SETUP',
    [approvalLimit] DECIMAL(15,2),
    [lastLoginAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email]),
    CONSTRAINT [users_adUsername_key] UNIQUE NONCLUSTERED ([adUsername])
);

-- CreateTable
CREATE TABLE [dbo].[user_companies] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [user_companies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_companies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [user_companies_userId_companyId_key] UNIQUE NONCLUSTERED ([userId],[companyId])
);

-- CreateTable
CREATE TABLE [dbo].[approval_tiers] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [level] INT NOT NULL,
    [maxAmount] DECIMAL(15,2),
    [active] BIT NOT NULL CONSTRAINT [approval_tiers_active_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [approval_tiers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [approval_tiers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [approval_tiers_companyId_level_key] UNIQUE NONCLUSTERED ([companyId],[level])
);

-- CreateTable
CREATE TABLE [dbo].[user_approval_tiers] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [tierId] UNIQUEIDENTIFIER NOT NULL,
    [validFrom] DATETIME2 NOT NULL CONSTRAINT [user_approval_tiers_validFrom_df] DEFAULT CURRENT_TIMESTAMP,
    [validUntil] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [user_approval_tiers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_approval_tiers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [user_approval_tiers_userId_tierId_key] UNIQUE NONCLUSTERED ([userId],[tierId])
);

-- CreateTable
CREATE TABLE [dbo].[delegations] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [delegatorId] UNIQUEIDENTIFIER NOT NULL,
    [delegateId] UNIQUEIDENTIFIER NOT NULL,
    [startsAt] DATETIME2 NOT NULL,
    [endsAt] DATETIME2 NOT NULL,
    [reason] NVARCHAR(500),
    [createdById] UNIQUEIDENTIFIER NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [delegations_active_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [delegations_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [delegations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[budget_entries] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [branchErpCode] NVARCHAR(50) NOT NULL,
    [costCenterErpCode] NVARCHAR(50) NOT NULL,
    [year] INT NOT NULL,
    [month] INT NOT NULL,
    [amountBudgeted] DECIMAL(15,2) NOT NULL,
    [amountCommitted] DECIMAL(15,2) NOT NULL CONSTRAINT [budget_entries_amountCommitted_df] DEFAULT 0,
    [amountConsumed] DECIMAL(15,2) NOT NULL CONSTRAINT [budget_entries_amountConsumed_df] DEFAULT 0,
    [importedById] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [budget_entries_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [budget_entries_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [budget_entries_companyId_branchErpCode_costCenterErpCode_year_month_key] UNIQUE NONCLUSTERED ([companyId],[branchErpCode],[costCenterErpCode],[year],[month])
);

-- CreateTable
CREATE TABLE [dbo].[requisitions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [number] NVARCHAR(20) NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [branchErpCode] NVARCHAR(50) NOT NULL,
    [branchName] NVARCHAR(255) NOT NULL,
    [supplierErpCode] NVARCHAR(50) NOT NULL,
    [supplierName] NVARCHAR(255) NOT NULL,
    [requesterId] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(500) NOT NULL,
    [justification] NVARCHAR(max),
    [tipoNotaFiscal] NVARCHAR(15) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [requisitions_status_df] DEFAULT 'DRAFT',
    [totalAmount] DECIMAL(15,2) NOT NULL CONSTRAINT [requisitions_totalAmount_df] DEFAULT 0,
    [neededBy] DATETIME2,
    [currentTierLevel] INT,
    [submittedAt] DATETIME2,
    [approvedAt] DATETIME2,
    [rejectedAt] DATETIME2,
    [rejectionReason] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [requisitions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [requisitions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [requisitions_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[requisition_items] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [requisitionId] UNIQUEIDENTIFIER NOT NULL,
    [itemErpCode] NVARCHAR(50),
    [itemDescription] NVARCHAR(500) NOT NULL,
    [quantity] DECIMAL(15,4) NOT NULL,
    [unit] NVARCHAR(20) NOT NULL,
    [estimatedPrice] DECIMAL(15,2) NOT NULL,
    [totalPrice] DECIMAL(15,2) NOT NULL,
    [accountingAccount] NVARCHAR(20) NOT NULL,
    [accountName] NVARCHAR(255),
    [branchRateioCode] NVARCHAR(20) NOT NULL,
    [branchRateioDesc] NVARCHAR(100),
    [costCenterRateioCode] NVARCHAR(20) NOT NULL,
    [costCenterRateioDesc] NVARCHAR(100),
    [notes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [requisition_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [requisition_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[purchase_orders] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [number] NVARCHAR(20) NOT NULL,
    [requisitionId] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [branchErpCode] NVARCHAR(50) NOT NULL,
    [branchName] NVARCHAR(255) NOT NULL,
    [supplierErpCode] NVARCHAR(50) NOT NULL,
    [supplierName] NVARCHAR(255) NOT NULL,
    [buyerId] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(25) NOT NULL CONSTRAINT [purchase_orders_status_df] DEFAULT 'DRAFT',
    [paymentCondition] NVARCHAR(255),
    [deliveryAddress] NVARCHAR(500),
    [expectedDelivery] DATETIME2,
    [totalAmount] DECIMAL(15,2) NOT NULL CONSTRAINT [purchase_orders_totalAmount_df] DEFAULT 0,
    [notes] NVARCHAR(max),
    [currentTierLevel] INT,
    [erpPedido] NVARCHAR(50),
    [erpStagingId] NVARCHAR(50),
    [pendingErpSince] DATETIME2,
    [integratedAt] DATETIME2,
    [submittedAt] DATETIME2,
    [approvedAt] DATETIME2,
    [sentToSupplierAt] DATETIME2,
    [cancelledAt] DATETIME2,
    [cancellationReason] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchase_orders_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [purchase_orders_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [purchase_orders_number_key] UNIQUE NONCLUSTERED ([number]),
    CONSTRAINT [purchase_orders_requisitionId_key] UNIQUE NONCLUSTERED ([requisitionId]),
    CONSTRAINT [purchase_orders_erpStagingId_key] UNIQUE NONCLUSTERED ([erpStagingId])
);

-- CreateTable
CREATE TABLE [dbo].[purchase_order_items] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [purchaseOrderId] UNIQUEIDENTIFIER NOT NULL,
    [requisitionItemId] UNIQUEIDENTIFIER,
    [itemErpCode] NVARCHAR(50),
    [itemDescription] NVARCHAR(500) NOT NULL,
    [quantity] DECIMAL(15,4) NOT NULL,
    [unit] NVARCHAR(20) NOT NULL,
    [unitPrice] DECIMAL(15,2) NOT NULL,
    [totalPrice] DECIMAL(15,2) NOT NULL,
    [accountingAccount] NVARCHAR(20) NOT NULL,
    [accountName] NVARCHAR(255),
    [branchRateioCode] NVARCHAR(20) NOT NULL,
    [branchRateioDesc] NVARCHAR(100),
    [costCenterRateioCode] NVARCHAR(20) NOT NULL,
    [costCenterRateioDesc] NVARCHAR(100),
    [receivedQty] DECIMAL(15,4) NOT NULL CONSTRAINT [purchase_order_items_receivedQty_df] DEFAULT 0,
    [notes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchase_order_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [purchase_order_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[fund_requests] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [number] NVARCHAR(20) NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [requisitionId] UNIQUEIDENTIFIER,
    [purchaseOrderId] UNIQUEIDENTIFIER,
    [requesterId] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(255) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [fund_requests_status_df] DEFAULT 'DRAFT',
    [totalAmount] DECIMAL(15,2) NOT NULL CONSTRAINT [fund_requests_totalAmount_df] DEFAULT 0,
    [currentTierLevel] INT,
    [erpSolicitacao] NVARCHAR(50),
    [erpStagingId] NVARCHAR(50),
    [pendingErpSince] DATETIME2,
    [integratedAt] DATETIME2,
    [submittedAt] DATETIME2,
    [approvedAt] DATETIME2,
    [rejectedAt] DATETIME2,
    [rejectionReason] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [fund_requests_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [fund_requests_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fund_requests_number_key] UNIQUE NONCLUSTERED ([number]),
    CONSTRAINT [fund_requests_requisitionId_key] UNIQUE NONCLUSTERED ([requisitionId]),
    CONSTRAINT [fund_requests_purchaseOrderId_key] UNIQUE NONCLUSTERED ([purchaseOrderId]),
    CONSTRAINT [fund_requests_erpStagingId_key] UNIQUE NONCLUSTERED ([erpStagingId])
);

-- CreateTable
CREATE TABLE [dbo].[fund_request_items] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [fundRequestId] UNIQUEIDENTIFIER NOT NULL,
    [itemErpCode] NVARCHAR(50),
    [description] NVARCHAR(500) NOT NULL,
    [beneficiaryName] NVARCHAR(255) NOT NULL,
    [beneficiaryBank] NVARCHAR(10),
    [beneficiaryAgency] NVARCHAR(10),
    [beneficiaryAccount] NVARCHAR(30),
    [accountingAccount] NVARCHAR(20) NOT NULL,
    [accountName] NVARCHAR(255),
    [branchRateioCode] NVARCHAR(20) NOT NULL,
    [branchRateioDesc] NVARCHAR(100),
    [costCenterRateioCode] NVARCHAR(20) NOT NULL,
    [costCenterRateioDesc] NVARCHAR(100),
    [amount] DECIMAL(15,2) NOT NULL,
    [dueDate] DATETIME2 NOT NULL,
    [notes] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [fund_request_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fund_request_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[approval_steps] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [entityType] NVARCHAR(20) NOT NULL,
    [requisitionId] UNIQUEIDENTIFIER,
    [purchaseOrderId] UNIQUEIDENTIFIER,
    [fundRequestId] UNIQUEIDENTIFIER,
    [tierId] UNIQUEIDENTIFIER NOT NULL,
    [level] INT NOT NULL,
    [approverId] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(10) NOT NULL CONSTRAINT [approval_steps_status_df] DEFAULT 'PENDING',
    [decidedAt] DATETIME2,
    [comments] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [approval_steps_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [approval_steps_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[receivings] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [number] NVARCHAR(20) NOT NULL,
    [purchaseOrderId] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [receivedById] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(15) NOT NULL CONSTRAINT [receivings_status_df] DEFAULT 'DRAFT',
    [receivedAt] DATETIME2 NOT NULL,
    [measurementStart] DATETIME2,
    [measurementEnd] DATETIME2,
    [completionPct] DECIMAL(5,2),
    [notes] NVARCHAR(max),
    [divergenceNotes] NVARCHAR(max),
    [confirmedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [receivings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [receivings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [receivings_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[receiving_items] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [receivingId] UNIQUEIDENTIFIER NOT NULL,
    [purchaseOrderItemId] UNIQUEIDENTIFIER NOT NULL,
    [receivedQty] DECIMAL(15,4) NOT NULL,
    [acceptedQty] DECIMAL(15,4) NOT NULL,
    [rejectedQty] DECIMAL(15,4) NOT NULL CONSTRAINT [receiving_items_rejectedQty_df] DEFAULT 0,
    [rejectionReason] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [receiving_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [receiving_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [action] NVARCHAR(50) NOT NULL,
    [entityType] NVARCHAR(100) NOT NULL,
    [entityId] UNIQUEIDENTIFIER NOT NULL,
    [before] NVARCHAR(max),
    [after] NVARCHAR(max),
    [ipAddress] NVARCHAR(50),
    [userAgent] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [audit_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[notifications] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(30) NOT NULL,
    [title] NVARCHAR(255) NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [entityType] NVARCHAR(100),
    [entityId] UNIQUEIDENTIFIER,
    [readAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [notifications_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [notifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[attachments] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [requisitionId] UNIQUEIDENTIFIER,
    [purchaseOrderId] UNIQUEIDENTIFIER,
    [fundRequestId] UNIQUEIDENTIFIER,
    [receivingId] UNIQUEIDENTIFIER,
    [filename] NVARCHAR(255) NOT NULL,
    [storageKey] NVARCHAR(500) NOT NULL,
    [sizeBytes] INT NOT NULL,
    [mimeType] NVARCHAR(100) NOT NULL,
    [uploadedById] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [attachments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [attachments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[integration_logs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [source] NVARCHAR(50) NOT NULL,
    [jobType] NVARCHAR(100) NOT NULL,
    [status] NVARCHAR(10) NOT NULL,
    [recordsProcessed] INT NOT NULL CONSTRAINT [integration_logs_recordsProcessed_df] DEFAULT 0,
    [errorDetails] NVARCHAR(max),
    [durationMs] INT,
    [executedAt] DATETIME2 NOT NULL CONSTRAINT [integration_logs_executedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [integration_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[document_sequences] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [docType] NVARCHAR(10) NOT NULL,
    [year] INT NOT NULL,
    [sequenceName] NVARCHAR(100) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [document_sequences_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [document_sequences_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [document_sequences_companyId_docType_year_key] UNIQUE NONCLUSTERED ([companyId],[docType],[year])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [budget_entries_companyId_year_idx] ON [dbo].[budget_entries]([companyId], [year]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [requisitions_companyId_status_idx] ON [dbo].[requisitions]([companyId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [requisitions_requesterId_status_idx] ON [dbo].[requisitions]([requesterId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [requisition_items_requisitionId_idx] ON [dbo].[requisition_items]([requisitionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_orders_companyId_status_idx] ON [dbo].[purchase_orders]([companyId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_orders_expectedDelivery_status_idx] ON [dbo].[purchase_orders]([expectedDelivery], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_order_items_purchaseOrderId_idx] ON [dbo].[purchase_order_items]([purchaseOrderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [fund_requests_companyId_status_idx] ON [dbo].[fund_requests]([companyId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [fund_request_items_fundRequestId_idx] ON [dbo].[fund_request_items]([fundRequestId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_steps_requisitionId_level_idx] ON [dbo].[approval_steps]([requisitionId], [level]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_steps_purchaseOrderId_level_idx] ON [dbo].[approval_steps]([purchaseOrderId], [level]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_steps_fundRequestId_level_idx] ON [dbo].[approval_steps]([fundRequestId], [level]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_steps_approverId_status_idx] ON [dbo].[approval_steps]([approverId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [receivings_purchaseOrderId_idx] ON [dbo].[receivings]([purchaseOrderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_entityType_entityId_idx] ON [dbo].[audit_logs]([entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_userId_createdAt_idx] ON [dbo].[audit_logs]([userId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_companyId_createdAt_idx] ON [dbo].[audit_logs]([companyId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_userId_readAt_idx] ON [dbo].[notifications]([userId], [readAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attachments_requisitionId_idx] ON [dbo].[attachments]([requisitionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attachments_purchaseOrderId_idx] ON [dbo].[attachments]([purchaseOrderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attachments_fundRequestId_idx] ON [dbo].[attachments]([fundRequestId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [attachments_receivingId_idx] ON [dbo].[attachments]([receivingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [integration_logs_companyId_source_executedAt_idx] ON [dbo].[integration_logs]([companyId], [source], [executedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [integration_logs_source_status_executedAt_idx] ON [dbo].[integration_logs]([source], [status], [executedAt]);

-- AddForeignKey
ALTER TABLE [dbo].[user_companies] ADD CONSTRAINT [user_companies_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_companies] ADD CONSTRAINT [user_companies_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_tiers] ADD CONSTRAINT [approval_tiers_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_approval_tiers] ADD CONSTRAINT [user_approval_tiers_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_approval_tiers] ADD CONSTRAINT [user_approval_tiers_tierId_fkey] FOREIGN KEY ([tierId]) REFERENCES [dbo].[approval_tiers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[delegations] ADD CONSTRAINT [delegations_delegatorId_fkey] FOREIGN KEY ([delegatorId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[delegations] ADD CONSTRAINT [delegations_delegateId_fkey] FOREIGN KEY ([delegateId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[budget_entries] ADD CONSTRAINT [budget_entries_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[requisitions] ADD CONSTRAINT [requisitions_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[requisitions] ADD CONSTRAINT [requisitions_requesterId_fkey] FOREIGN KEY ([requesterId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[requisition_items] ADD CONSTRAINT [requisition_items_requisitionId_fkey] FOREIGN KEY ([requisitionId]) REFERENCES [dbo].[requisitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_orders] ADD CONSTRAINT [purchase_orders_requisitionId_fkey] FOREIGN KEY ([requisitionId]) REFERENCES [dbo].[requisitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_orders] ADD CONSTRAINT [purchase_orders_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_orders] ADD CONSTRAINT [purchase_orders_buyerId_fkey] FOREIGN KEY ([buyerId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_order_items] ADD CONSTRAINT [purchase_order_items_purchaseOrderId_fkey] FOREIGN KEY ([purchaseOrderId]) REFERENCES [dbo].[purchase_orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fund_requests] ADD CONSTRAINT [fund_requests_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fund_requests] ADD CONSTRAINT [fund_requests_requisitionId_fkey] FOREIGN KEY ([requisitionId]) REFERENCES [dbo].[requisitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fund_requests] ADD CONSTRAINT [fund_requests_purchaseOrderId_fkey] FOREIGN KEY ([purchaseOrderId]) REFERENCES [dbo].[purchase_orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fund_requests] ADD CONSTRAINT [fund_requests_requesterId_fkey] FOREIGN KEY ([requesterId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fund_request_items] ADD CONSTRAINT [fund_request_items_fundRequestId_fkey] FOREIGN KEY ([fundRequestId]) REFERENCES [dbo].[fund_requests]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_requisitionId_fkey] FOREIGN KEY ([requisitionId]) REFERENCES [dbo].[requisitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_purchaseOrderId_fkey] FOREIGN KEY ([purchaseOrderId]) REFERENCES [dbo].[purchase_orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_fundRequestId_fkey] FOREIGN KEY ([fundRequestId]) REFERENCES [dbo].[fund_requests]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_tierId_fkey] FOREIGN KEY ([tierId]) REFERENCES [dbo].[approval_tiers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_approverId_fkey] FOREIGN KEY ([approverId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receivings] ADD CONSTRAINT [receivings_purchaseOrderId_fkey] FOREIGN KEY ([purchaseOrderId]) REFERENCES [dbo].[purchase_orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receivings] ADD CONSTRAINT [receivings_receivedById_fkey] FOREIGN KEY ([receivedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receiving_items] ADD CONSTRAINT [receiving_items_receivingId_fkey] FOREIGN KEY ([receivingId]) REFERENCES [dbo].[receivings]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receiving_items] ADD CONSTRAINT [receiving_items_purchaseOrderItemId_fkey] FOREIGN KEY ([purchaseOrderItemId]) REFERENCES [dbo].[purchase_order_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attachments] ADD CONSTRAINT [attachments_requisitionId_fkey] FOREIGN KEY ([requisitionId]) REFERENCES [dbo].[requisitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attachments] ADD CONSTRAINT [attachments_purchaseOrderId_fkey] FOREIGN KEY ([purchaseOrderId]) REFERENCES [dbo].[purchase_orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attachments] ADD CONSTRAINT [attachments_fundRequestId_fkey] FOREIGN KEY ([fundRequestId]) REFERENCES [dbo].[fund_requests]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[attachments] ADD CONSTRAINT [attachments_receivingId_fkey] FOREIGN KEY ([receivingId]) REFERENCES [dbo].[receivings]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[integration_logs] ADD CONSTRAINT [integration_logs_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
