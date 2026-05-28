/**
 * Diagnóstico do "Saldo a entregar = 0" no PEDIDO 60285 (Linx).
 *
 * A tela "Compras de Consumíveis/Imobilizáveis" mostra:
 *   - Qtde. Total = 1 / Total = 20,00     (campos QTDE_ORIGINAL e VALOR_ORIGINAL)
 *   - Saldo a entregar Qtde = 0 / Vlr = 0 (presumido: QTDE_ENTREGAR/VALOR_ENTREGAR
 *                                           ou SALDO_QTDE/SALDO_VALOR)
 *
 * No INSERT do P2P (linx-erp.service.ts:401) gravamos:
 *   QTDE_ORIGINAL = QTDE_ENTREGAR = @P7  (qty)
 *   VALOR_ORIGINAL = VALOR_ENTREGAR = @P8  (totalIt)
 *
 * Esse script vai mostrar TODAS as colunas da linha em COMPRAS_CONSUMIVEL
 * pro PEDIDO 60285 — vamos descobrir se:
 *   (a) o INSERT entrou zerado mesmo (problema no nosso código)
 *   (b) um trigger do Linx zerou pós-insert (regra de negócio do ERP)
 *   (c) a tela usa OUTRO campo de saldo (ex.: SALDO_QTDE, QTDE_RECEBIDA)
 */

import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const adapter = new PrismaMssql({
  server: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT ?? 1433),
  database: process.env.DB_NAME!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: { trustServerCertificate: true, encrypt: true },
});

const ERP_DB = process.env.ERP_DB ?? 'HML_GUESS'; // ajuste se for PROD
const PEDIDO = Number(process.env.PEDIDO ?? '60285');

async function main() {
  const prisma = new PrismaClient({ adapter });
  try {
    console.log(`\n=== PEDIDO ${PEDIDO} em [${ERP_DB}] ===\n`);

    // 1) Lista colunas existentes na COMPRAS_CONSUMIVEL — pra descobrir
    //    se tem SALDO_QTDE, QTDE_RECEBIDA, etc.
    const cols = await prisma.$queryRawUnsafe<{ COLUMN_NAME: string; DATA_TYPE: string }[]>(
      `SELECT COLUMN_NAME, DATA_TYPE
         FROM [${ERP_DB}].INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'COMPRAS_CONSUMIVEL'
        ORDER BY ORDINAL_POSITION`,
    );
    console.log('Colunas de COMPRAS_CONSUMIVEL:');
    cols.forEach((c) => console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE})`));

    // 2) Conteúdo da(s) linha(s) do pedido.
    console.log(`\nLinhas do pedido ${PEDIDO}:`);
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM [${ERP_DB}].dbo.COMPRAS_CONSUMIVEL WITH (NOLOCK)
        WHERE PEDIDO = '${PEDIDO}'`,
    );
    rows.forEach((r, i) => {
      console.log(`--- item #${i + 1} ---`);
      Object.entries(r).forEach(([k, v]) => console.log(`  ${k} = ${String(v)}`));
    });

    // 3) Cabeçalho COMPRAS pra ver STATUS_COMPRA etc.
    console.log(`\nCabeçalho COMPRAS:`);
    const head = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM [${ERP_DB}].dbo.COMPRAS WITH (NOLOCK)
        WHERE PEDIDO = '${PEDIDO}'`,
    );
    head.forEach((r) => {
      Object.entries(r).forEach(([k, v]) => console.log(`  ${k} = ${String(v)}`));
    });

    // 4) Triggers ativos na COMPRAS_CONSUMIVEL — pra descobrir quem
    //    poderia ter zerado QTDE_ENTREGAR.
    console.log(`\nTriggers em COMPRAS_CONSUMIVEL:`);
    const trgs = await prisma.$queryRawUnsafe<
      { name: string; is_disabled: number; type_desc: string }[]
    >(
      `SELECT t.name, t.is_disabled, te.type_desc
         FROM [${ERP_DB}].sys.triggers t
         JOIN [${ERP_DB}].sys.trigger_events te ON te.object_id = t.object_id
        WHERE t.parent_id = OBJECT_ID('[${ERP_DB}].dbo.COMPRAS_CONSUMIVEL')`,
    );
    trgs.forEach((t) => console.log(`  - ${t.name} [${t.type_desc}] disabled=${t.is_disabled}`));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
