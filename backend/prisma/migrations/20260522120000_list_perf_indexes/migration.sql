-- Índices compostos pra cobrir os findAll mais comuns de Requisição e PC.
-- O padrão é: WHERE companyId [+ teamId] [+ status] ORDER BY createdAt DESC.
-- Sem o createdAt no índice, SQL Server faz scan + sort manual; com take=50
-- ainda pesa quando a tabela cresce. Com o índice abaixo, o motor consegue
-- index seek + retornar já ordenado.

CREATE INDEX [IX_requisitions_company_team_createdAt]
  ON [dbo].[requisitions] ([companyId], [teamId], [createdAt] DESC);

CREATE INDEX [IX_requisitions_company_createdAt]
  ON [dbo].[requisitions] ([companyId], [createdAt] DESC);

CREATE INDEX [IX_purchase_orders_company_createdAt]
  ON [dbo].[purchase_orders] ([companyId], [createdAt] DESC);
