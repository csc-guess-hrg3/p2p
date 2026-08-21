-- Cura do admin de bootstrap rebaixado pela F0 (backfill @p2p.local).
-- O seed-admin cria admin@p2p.local; o backfill da migration
-- 20260810120000_area_externa_f0_realm (antes de ganhar o guard profile<>ADMIN)
-- marcava esse admin como EXTERNAL/VENDEDOR_LOJA, trancando-o fora do app
-- interno. Aqui restauramos qualquer ADMIN nessa situação.
--
-- Idempotente e específico: só toca em profile=ADMIN com e-mail @p2p.local que
-- esteja marcado como externo — vendedor de loja é OPERATOR, nunca casa.
EXEC sp_executesql N'
UPDATE [dbo].[users]
   SET [realm] = ''INTERNAL'', [externalCategory] = NULL
 WHERE [profile] = ''ADMIN''
   AND [email] LIKE ''%@p2p.local''
   AND ([realm] <> ''INTERNAL'' OR [externalCategory] IS NOT NULL);
';
