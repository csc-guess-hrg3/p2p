-- Marca d'água de CreatedAt pro sync incremental da Qive.
--
-- Antes: o cron varria a conta inteira (~56k NFs, ~9MB/página) de hora em
-- hora. Ao terminar o walk, o paginator era zerado e a próxima execução
-- recomeçava do início — um full-scan perpétuo.
--
-- Agora: ao DRENAR a janela atual, gravamos createdAtWatermark com o
-- instante em que o walk começou. As próximas execuções pedem à Qive só
-- CreatedAt.From = watermark - folga, trazendo apenas o que entrou de novo.
--
-- Linhas existentes ficam com watermark NULL → a 1ª execução pós-deploy
-- roda em modo "backfill" (janela ampla) e, ao drenar, marca a posição.

EXEC sp_executesql N'
IF NOT EXISTS (SELECT 1 FROM sys.columns
   WHERE Name = ''createdAtWatermark''
     AND Object_ID = Object_ID(''dbo.fiscal_document_sync_states''))
BEGIN
  ALTER TABLE [dbo].[fiscal_document_sync_states]
    ADD [createdAtWatermark] DATETIME2 NULL;
END;
';
