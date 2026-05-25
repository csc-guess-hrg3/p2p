-- =========================================================================
-- Fase 1 do escopo "Supervisor de filiais + auth local + cadeia dinâmica":
--  * Tabela positions (cargos do P2P)
--  * User com loginType, passwordHash, passwordSetAt, cpf, positionId
--  * adUsername fica opcional (suporte a usuários sem AD)
--  * Tabela user_branch_assignments (N:N pessoa↔filial)
--  * Tabela password_setup_tokens (link de definição/recuperação de senha)
--  * TeamApprovalLevel ganha requiredPositionId + scopeByBranch;
--    approverId vira opcional
--
-- Prisma roda o arquivo como 1 batch SQL (sem GO). Statements que dependem
-- de colunas recém-criadas usam EXEC sp_executesql pra forçar recompilação.
-- =========================================================================

-- 1) POSITIONS (idempotente — tolera tabela órfã de tentativa anterior)
IF OBJECT_ID('dbo.positions', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[positions] (
    [id]        UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_positions_id] DEFAULT NEWID(),
    [code]      NVARCHAR(40)     NOT NULL,
    [name]      NVARCHAR(150)    NOT NULL,
    [active]    BIT              NOT NULL CONSTRAINT [DF_positions_active] DEFAULT 1,
    [createdAt] DATETIME2        NOT NULL CONSTRAINT [DF_positions_createdAt] DEFAULT GETDATE(),
    [updatedAt] DATETIME2        NOT NULL,
    [deletedAt] DATETIME2        NULL,
    CONSTRAINT [PK_positions] PRIMARY KEY ([id]),
    CONSTRAINT [UK_positions_code] UNIQUE ([code])
  );
END;

-- 2) USER: adUsername opcional + novas colunas
-- Drop do índice único existente (não-filtrado) — vamos recriar filtrado.
ALTER TABLE [dbo].[users] DROP CONSTRAINT [users_adUsername_key];
ALTER TABLE [dbo].[users] ALTER COLUMN [adUsername] NVARCHAR(255) NULL;

-- Recria índice único filtrado (vários NULL permitidos). Em EXEC pra
-- garantir resolução depois do ALTER acima.
EXEC sp_executesql N'CREATE UNIQUE INDEX [users_adUsername_key]
  ON [dbo].[users]([adUsername])
  WHERE [adUsername] IS NOT NULL';

ALTER TABLE [dbo].[users]
  ADD [loginType]     NVARCHAR(10)     NOT NULL CONSTRAINT [DF_users_loginType] DEFAULT 'AD',
      [cpf]           NVARCHAR(11)     NULL,
      [passwordHash]  NVARCHAR(255)    NULL,
      [passwordSetAt] DATETIME2        NULL,
      [positionId]    UNIQUEIDENTIFIER NULL;

-- CPF único filtrado (NULLs múltiplos permitidos).
EXEC sp_executesql N'CREATE UNIQUE INDEX [users_cpf_key]
  ON [dbo].[users]([cpf])
  WHERE [cpf] IS NOT NULL';

ALTER TABLE [dbo].[users]
  ADD CONSTRAINT [FK_users_position]
    FOREIGN KEY ([positionId]) REFERENCES [dbo].[positions]([id])
    ON UPDATE NO ACTION ON DELETE NO ACTION;

-- 3) USER_BRANCH_ASSIGNMENTS
CREATE TABLE [dbo].[user_branch_assignments] (
  [userId]        UNIQUEIDENTIFIER NOT NULL,
  [companyId]     UNIQUEIDENTIFIER NOT NULL,
  [branchErpCode] NVARCHAR(20)     NOT NULL,
  [createdAt]     DATETIME2        NOT NULL CONSTRAINT [DF_uba_createdAt] DEFAULT GETDATE(),
  CONSTRAINT [PK_user_branch_assignments] PRIMARY KEY ([userId], [companyId], [branchErpCode]),
  CONSTRAINT [FK_uba_user]    FOREIGN KEY ([userId])    REFERENCES [dbo].[users]([id])     ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT [FK_uba_company] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- 4) PASSWORD_SETUP_TOKENS
CREATE TABLE [dbo].[password_setup_tokens] (
  [id]        UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_pst_id] DEFAULT NEWID(),
  [userId]    UNIQUEIDENTIFIER NOT NULL,
  [tokenHash] NVARCHAR(64)     NOT NULL,
  [purpose]   NVARCHAR(20)     NOT NULL,
  [expiresAt] DATETIME2        NOT NULL,
  [usedAt]    DATETIME2        NULL,
  [createdAt] DATETIME2        NOT NULL CONSTRAINT [DF_pst_createdAt] DEFAULT GETDATE(),
  CONSTRAINT [PK_password_setup_tokens] PRIMARY KEY ([id]),
  CONSTRAINT [UK_pst_tokenHash] UNIQUE ([tokenHash]),
  CONSTRAINT [FK_pst_user] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX [IX_pst_userId] ON [dbo].[password_setup_tokens]([userId]);

-- 5) TEAM_APPROVAL_LEVELS: approverId opcional + requiredPositionId + scopeByBranch
-- Derruba a FK existente pra trocar o tipo. O Prisma gera nomes determinísticos,
-- mas pra ser seguro lemos do catálogo.
DECLARE @fk sysname;
SELECT @fk = fk.name FROM sys.foreign_keys fk
 WHERE fk.parent_object_id = OBJECT_ID('dbo.team_approval_levels')
   AND OBJECT_NAME(fk.referenced_object_id) = 'users';
IF @fk IS NOT NULL EXEC('ALTER TABLE [dbo].[team_approval_levels] DROP CONSTRAINT [' + @fk + ']');

ALTER TABLE [dbo].[team_approval_levels] ALTER COLUMN [approverId] UNIQUEIDENTIFIER NULL;

ALTER TABLE [dbo].[team_approval_levels]
  ADD [requiredPositionId] UNIQUEIDENTIFIER NULL,
      [scopeByBranch]      BIT              NOT NULL CONSTRAINT [DF_tal_scopeByBranch] DEFAULT 0;

ALTER TABLE [dbo].[team_approval_levels]
  ADD CONSTRAINT [FK_tal_approver]
    FOREIGN KEY ([approverId])
    REFERENCES [dbo].[users]([id])
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE [dbo].[team_approval_levels]
  ADD CONSTRAINT [FK_tal_position]
    FOREIGN KEY ([requiredPositionId])
    REFERENCES [dbo].[positions]([id])
    ON UPDATE NO ACTION ON DELETE NO ACTION;
