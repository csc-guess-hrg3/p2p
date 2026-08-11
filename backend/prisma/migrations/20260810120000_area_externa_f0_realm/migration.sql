-- Área Externa — F0: fundação de realm.
-- Aditiva e idempotente. Não toca no ERP/Linx (só o banco do app P2P_DB).
--   * users.realm (NOT NULL default 'INTERNAL')  -> discriminador app interno x portal externo
--   * users.externalCategory (NULL)              -> REPRESENTANTE | VENDEDOR_LOJA | ... (null p/ INTERNAL)
--   * external_scope_assignments                 -> escopo row-level genérico (scopeType, scopeKey)
--   * backfill: vendedores de loja (email @p2p.local) viram realm=EXTERNAL/VENDEDOR_LOJA
--
-- Cada passo vai em seu próprio EXEC sp_executesql: a compilação é diferida,
-- então o backfill que referencia [realm] compila DEPOIS da coluna existir
-- (o arquivo roda como um único batch via apply-migration-direct.ts).

-- 1) users.realm
EXEC sp_executesql N'
IF COL_LENGTH(''dbo.users'', ''realm'') IS NULL
  ALTER TABLE [dbo].[users]
    ADD [realm] NVARCHAR(10) NOT NULL
      CONSTRAINT [DF_users_realm] DEFAULT ''INTERNAL'';
';

-- 2) users.externalCategory
EXEC sp_executesql N'
IF COL_LENGTH(''dbo.users'', ''externalCategory'') IS NULL
  ALTER TABLE [dbo].[users]
    ADD [externalCategory] NVARCHAR(30) NULL;
';

-- 3) external_scope_assignments
EXEC sp_executesql N'
IF OBJECT_ID(''dbo.external_scope_assignments'', ''U'') IS NULL
BEGIN
  CREATE TABLE [dbo].[external_scope_assignments] (
    [id]        UNIQUEIDENTIFIER NOT NULL,
    [userId]    UNIQUEIDENTIFIER NOT NULL,
    [companyId] UNIQUEIDENTIFIER NOT NULL,
    [scopeType] NVARCHAR(30) NOT NULL,
    [scopeKey]  NVARCHAR(60) NOT NULL,
    [createdAt] DATETIME2 NOT NULL
      CONSTRAINT [external_scope_assignments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [external_scope_assignments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [external_scope_assignments_userId_companyId_scopeType_scopeKey_key]
      UNIQUE NONCLUSTERED ([userId],[companyId],[scopeType],[scopeKey])
  );

  CREATE NONCLUSTERED INDEX [external_scope_assignments_scopeType_scopeKey_idx]
    ON [dbo].[external_scope_assignments]([scopeType],[scopeKey]);

  ALTER TABLE [dbo].[external_scope_assignments]
    ADD CONSTRAINT [external_scope_assignments_userId_fkey]
    FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id])
    ON DELETE CASCADE ON UPDATE NO ACTION;

  ALTER TABLE [dbo].[external_scope_assignments]
    ADD CONSTRAINT [external_scope_assignments_companyId_fkey]
    FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END;
';

-- 4) Backfill: os vendedores de loja já existentes (login por CPF, e-mail
--    sintético @p2p.local) passam a ser EXTERNAL/VENDEDOR_LOJA, fechando a
--    brecha de eles alcançarem o app interno. Assinatura exclusiva desse
--    público (supervisores locais usam e-mail corporativo real).
EXEC sp_executesql N'
UPDATE [dbo].[users]
   SET [realm] = ''EXTERNAL'', [externalCategory] = ''VENDEDOR_LOJA''
 WHERE [realm] = ''INTERNAL''
   AND [email] LIKE ''%@p2p.local'';
';
