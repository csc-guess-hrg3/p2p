-- 1) User.username — login P2P-local definido pelo Admin (supervisor etc.)
--    Mutuamente exclusivo com adUsername. Único quando preenchido.
ALTER TABLE [dbo].[users]
  ADD [username] NVARCHAR(60) NULL;

EXEC sp_executesql N'CREATE UNIQUE INDEX [users_username_key]
  ON [dbo].[users]([username])
  WHERE [username] IS NOT NULL';

-- 2) branch_extensions — dados P2P-side por filial (e-mail, no MVP).
CREATE TABLE [dbo].[branch_extensions] (
  [companyId]     UNIQUEIDENTIFIER NOT NULL,
  [branchErpCode] NVARCHAR(20)     NOT NULL,
  [email]         NVARCHAR(255)    NULL,
  [updatedAt]     DATETIME2        NOT NULL,
  [createdAt]     DATETIME2        NOT NULL CONSTRAINT [DF_be_createdAt] DEFAULT GETDATE(),
  CONSTRAINT [PK_branch_extensions] PRIMARY KEY ([companyId], [branchErpCode]),
  CONSTRAINT [FK_be_company]
    FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id])
    ON UPDATE NO ACTION ON DELETE NO ACTION
);
