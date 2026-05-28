-- Snapshot da proposta original da requisição.
-- Quando o aprovador escolhe uma cotação vencedora, sobrescrevemos
-- supplier/items/total da req com os dados da cotação. Antes, NÃO dava
-- pra desfazer essa escolha (clearWinner bloqueava). Agora gravamos um
-- snapshot JSON antes da primeira mutação, permitindo restaurar.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(''dbo.requisitions'') AND name = ''originalProposalSnapshot'')
BEGIN
  ALTER TABLE [dbo].[requisitions]
    ADD [originalProposalSnapshot] NVARCHAR(MAX) NULL;
END;
';
