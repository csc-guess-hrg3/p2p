-- Aceita múltiplas raízes de CNPJ por empresa (Guess tem 3 raízes
-- distintas: 09391614, 17809524, 11850562). Armazena JSON array de
-- strings de 8 dígitos. Usado pra rotear NFe da Qive pra company
-- certa pelo CNPJ do destinatário.
--
-- Toda a migration roda dentro de sp_executesql pra evitar que o parser
-- valide a coluna nova no mesmo batch (sem isso a primeira migration
-- falha: "Invalid column name cnpjRaizes" no UPDATE).

EXEC sp_executesql N'
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
   WHERE Name = ''cnpjRaizes''
     AND Object_ID = Object_ID(''dbo.companies'')
)
BEGIN
  ALTER TABLE [dbo].[companies] ADD [cnpjRaizes] NVARCHAR(500) NULL;
END;
';

EXEC sp_executesql N'
UPDATE [dbo].[companies]
   SET [cnpjRaizes] = ''["09391614","17809524","11850562"]''
 WHERE [code] = ''GUESS'' AND [cnpjRaizes] IS NULL;
';
