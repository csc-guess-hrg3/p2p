/**
 * Carga total (backfill) das NFes da Qive para UMA empresa, de forma
 * controlada e síncrona.
 *
 * Quando usar: na primeira carga de uma empresa, ou para reprocessar do
 * zero. Depois disso o cron horário (@Cron EVERY_HOUR) segue INCREMENTAL
 * pela marca d'água (createdAtWatermark) — não precisa rodar de novo.
 *
 * O filtro é por data de CRIAÇÃO na Qive (CreatedAt), não por emissão.
 *
 * Uso (rodar com o MESMO env do backend — DB_* e QIVE_* definidos):
 *   npm run qive:backfill -- GUESS
 *   npm run qive:backfill -- HRG3
 *   npm run qive:backfill -- <companyId-uuid>
 *
 * Aceita o CODE da empresa (GUESS, HRG3...) ou o id (uuid).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FiscalDocumentsService } from '../src/fiscal-documents/fiscal-documents.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: npm run qive:backfill -- <CODE|companyId>');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    const fiscal = app.get(FiscalDocumentsService);

    const isUuid = /^[0-9a-f-]{36}$/i.test(arg);
    const company = await prisma.company.findFirst({
      where: isUuid ? { id: arg } : { code: arg.toUpperCase() },
      select: { id: true, code: true },
    });
    if (!company) {
      console.error(`Empresa não encontrada: ${arg}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `\n>>> Backfill Qive — empresa ${company.code} (${company.id})`,
    );
    console.log(
      '    Drena a conta inteira da Qive para esta empresa (pode levar minutos).\n',
    );
    const t0 = Date.now();
    const out = await fiscal.runFullBackfill(company.id);
    console.log(
      `\n<<< Concluído em ${Math.round((Date.now() - t0) / 1000)}s: ` +
        `${out.inserted} novas, ${out.existed} já existiam, ${out.ignored} ignoradas ` +
        `(total visto na Qive = ${out.totalSeen}).`,
    );
    console.log(
      "    Marca d'água gravada — o cron seguirá incremental daqui pra frente.\n",
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Backfill falhou:', err);
  process.exit(1);
});
