/**
 * Diagnóstico: quais CNPJs da conta Qive NÃO roteiam pra nenhuma empresa
 * do P2P (= origem das NFs "ignoradas" no sync)?
 *
 * Replica a regra exata do FiscalDocumentsService.resolveCompanyForDest:
 *   1) match exato pelo CNPJ completo via FILIAIS (cross-DB);
 *   2) fallback pela raiz (8 primeiros dígitos) em Company.cnpjRaizes/cnpj.
 *
 * Uso:
 *   node --env-file=.env -r ts-node/register scripts/diag-qive-cnpjs.ts
 *
 * Só LEITURA (Qive GET /v1/company + SELECTs). Não escreve nada.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

function clean(c: string): string {
  return (c ?? '').replace(/\D/g, '');
}

function fmtCnpj(c: string): string {
  return c.length === 14
    ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
    : c;
}

async function main() {
  // ── 1. CNPJs cadastrados na conta Qive ────────────────────────────
  const apiId = process.env.QIVE_API_ID;
  const apiKey = process.env.QIVE_API_KEY;
  if (!apiId || !apiKey) throw new Error('QIVE_API_ID/QIVE_API_KEY ausentes');
  const res = await fetch('https://api.arquivei.com.br/v1/company', {
    headers: { 'x-api-id': apiId, 'x-api-key': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Qive /v1/company HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: unknown[] };
  // A doc diz string[], mas aceita objetos também por robustez.
  const qiveCnpjs = (json.data ?? [])
    .map((d) => (typeof d === 'string' ? d : JSON.stringify(d)))
    .map(clean)
    .filter((c) => c.length === 14);
  console.log(`Qive: ${qiveCnpjs.length} CNPJs cadastrados na conta\n`);

  // ── 2. Empresas + FILIAIS do P2P (mesma fonte do sync) ────────────
  const adapter = new PrismaMssql({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { encrypt: false, trustServerCertificate: true },
  });
  const prisma = new PrismaClient({ adapter });

  const companies = await prisma.company.findMany({
    where: { active: true, deletedAt: null },
    select: { id: true, code: true, cnpj: true, cnpjRaizes: true, erpDbName: true },
  });

  // Mapa exato CNPJ→empresa via FILIAIS (igual getCnpjToCompanyMap)
  const filialMap = new Map<string, string>(); // cnpj → company code
  for (const c of companies) {
    const db = c.erpDbName ?? '';
    if (!/^[A-Za-z0-9_]+$/.test(db)) continue;
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ cnpj: string }>>(`
        SELECT REPLACE(REPLACE(REPLACE(ISNULL(CGC_CPF,''),'.',''),'/',''),'-','') AS cnpj
          FROM [${db}].dbo.FILIAIS WITH (NOLOCK)
         WHERE LEN(REPLACE(REPLACE(REPLACE(ISNULL(CGC_CPF,''),'.',''),'/',''),'-','')) = 14
      `);
      rows.forEach((r) => r.cnpj && filialMap.set(r.cnpj, c.code));
      console.log(`FILIAIS de ${c.code} (${db}): ${rows.length} CNPJs`);
    } catch (err) {
      console.warn(`FILIAIS de ${c.code} (${db}) FALHOU: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  // Raízes por empresa (fallback do roteamento)
  const raizOf = (code: string, raw: string | null, cnpj: string | null) => {
    const set = new Set<string>();
    (raw ?? '')
      .split(/[,;\s]+/)
      .map(clean)
      .filter((r) => r.length >= 8)
      .forEach((r) => set.add(r.slice(0, 8)));
    if (cnpj && clean(cnpj).length === 14) set.add(clean(cnpj).slice(0, 8));
    return { code, raizes: set };
  };
  const companyRaizes = companies.map((c) => raizOf(c.code, c.cnpjRaizes, c.cnpj));
  console.log('\nRaízes por empresa:');
  companyRaizes.forEach((c) => console.log(`  ${c.code}: ${[...c.raizes].join(', ') || '(nenhuma)'}`));

  // ── 3. Classifica cada CNPJ da conta Qive ─────────────────────────
  console.log('\n──────── CLASSIFICAÇÃO ────────');
  const fora: string[] = [];
  for (const q of qiveCnpjs) {
    const exact = filialMap.get(q);
    const byRaiz = companyRaizes.find((c) => c.raizes.has(q.slice(0, 8)));
    if (exact) {
      console.log(`  ✅ ${fmtCnpj(q)} → ${exact} (filial exata)`);
    } else if (byRaiz) {
      console.log(`  ✅ ${fmtCnpj(q)} → ${byRaiz.code} (raiz ${q.slice(0, 8)})`);
    } else {
      console.log(`  ❌ ${fmtCnpj(q)} → NÃO ROTEIA (NFs ignoradas!)`);
      fora.push(q);
    }
  }

  console.log(`\nResultado: ${fora.length} CNPJ(s) da conta Qive fora do roteamento do P2P`);
  if (fora.length) {
    console.log('Estes são os destinos das NFs "ignoradas":');
    fora.forEach((c) => console.log(`  - ${fmtCnpj(c)}`));
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('ERRO:', (err as Error).message);
  process.exit(1);
});
