-- Captura do último erro de integração da SV com o Linx.
-- Antes o erro só ia pra integration_logs e o usuário não tinha visibilidade
-- pela UI — só via empty "Nº Linx". Agora persistimos a mensagem na própria
-- SV, e a coluna é limpa quando a integração tem sucesso.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(''dbo.fund_requests'') AND name = ''lastErpError'')
BEGIN
  ALTER TABLE [dbo].[fund_requests]
    ADD [lastErpError]     NVARCHAR(MAX) NULL,
        [lastErpAttemptAt] DATETIME2 NULL;
END;
';
