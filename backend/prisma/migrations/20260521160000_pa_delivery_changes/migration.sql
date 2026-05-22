-- Histórico DE/PARA de reagendamento de entrega de pedidos PA.
-- scope='order' aplica a todos os itens; scope='item' identifica um item
-- pela chave (produto, cor, entregaOriginal). A chave do item é a ENTREGA
-- original do ERP (não a vigente) pra ficar estável após reagendamentos.

CREATE TABLE [dbo].[pa_delivery_changes] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_pa_dl_chg_id] DEFAULT NEWID(),
  [companyId] UNIQUEIDENTIFIER NOT NULL,
  [pedido] NVARCHAR(20) NOT NULL,
  [scope] NVARCHAR(10) NOT NULL, -- 'order' | 'item'
  [produto] NVARCHAR(50) NULL,
  [cor] NVARCHAR(20) NULL,
  [entregaOriginal] DATETIME2 NULL,
  [fromDate] DATETIME2 NOT NULL,
  [toDate] DATETIME2 NOT NULL,
  [reason] NVARCHAR(500) NOT NULL,
  [changedById] UNIQUEIDENTIFIER NOT NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_pa_dl_chg_created] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [PK_pa_delivery_changes] PRIMARY KEY ([id]),
  CONSTRAINT [FK_pa_dl_chg_user] FOREIGN KEY ([changedById]) REFERENCES [dbo].[users]([id])
);

CREATE INDEX [IX_pa_dl_chg_company_pedido]
  ON [dbo].[pa_delivery_changes] ([companyId], [pedido]);
