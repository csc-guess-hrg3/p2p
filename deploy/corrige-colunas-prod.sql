/* ===========================================================================
   P2P — colunas que faltam em PRODUÇÃO (192.168.10.5 / P2P_DB)
   Rode no SSMS conectado no banco P2P_DB.

   Adiciona, SÓ SE AINDA NÃO EXISTIR (idempotente — pode rodar de novo sem erro):
     1) users.branchScoped   (login de loja: enxerga a filial inteira)
     2) teams.companyId + FK  (empresa de origem da equipe: Guess x HRG3)

   É aditivo e seguro: não mexe em dado nenhum, só cria as colunas.
   =========================================================================== */
USE [P2P_DB];
GO

SET XACT_ABORT ON;
BEGIN TRAN;

-- 1) users.branchScoped ------------------------------------------------------
IF COL_LENGTH('dbo.users', 'branchScoped') IS NULL
BEGIN
    ALTER TABLE [dbo].[users]
        ADD [branchScoped] BIT NOT NULL
        CONSTRAINT [users_branchScoped_df] DEFAULT 0;
    PRINT 'users.branchScoped: CRIADA';
END
ELSE
    PRINT 'users.branchScoped: ja existia (nada a fazer)';

-- 2) teams.companyId ---------------------------------------------------------
IF COL_LENGTH('dbo.teams', 'companyId') IS NULL
BEGIN
    ALTER TABLE [dbo].[teams]
        ADD [companyId] UNIQUEIDENTIFIER NULL;
    PRINT 'teams.companyId: CRIADA';
END
ELSE
    PRINT 'teams.companyId: ja existia (nada a fazer)';

COMMIT TRAN;
GO

-- 3) FK teams.companyId -> companies.id (fora da transação; a coluna já existe)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'teams_companyId_fkey')
BEGIN
    ALTER TABLE [dbo].[teams]
        ADD CONSTRAINT [teams_companyId_fkey]
        FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION;
    PRINT 'FK teams_companyId_fkey: CRIADA';
END
ELSE
    PRINT 'FK teams_companyId_fkey: ja existia (nada a fazer)';
GO

/* --- Conferência: as duas colunas devem aparecer aqui --------------------- */
SELECT 'users.branchScoped' AS coluna,
       COL_LENGTH('dbo.users','branchScoped') AS existe
UNION ALL
SELECT 'teams.companyId',
       COL_LENGTH('dbo.teams','companyId')
UNION ALL
SELECT 'FK teams_companyId_fkey',
       CASE WHEN EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='teams_companyId_fkey')
            THEN 1 ELSE NULL END;
GO
