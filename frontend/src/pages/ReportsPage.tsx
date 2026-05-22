import { useState } from 'react';
import { Download, FileBarChart, FileText, Wallet } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { exportToCsv } from '@/lib/csv';
import { useRel001, useRel002, useRel003 } from '@/lib/reports';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ReportKey = 'rel-001' | 'rel-002' | 'rel-003' | null;

/**
 * Página única que abriga os 3 relatórios do MVP (PRD § 13).
 *
 * REL-004 a REL-007 dependem dos módulos Financeiro e Documentos
 * Fiscais (Fase 2 do roadmap) — ficam como placeholders desabilitados
 * pra deixar visível o que vem em seguida.
 */
export function ReportsPage() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;
  const [open, setOpen] = useState<ReportKey>(null);

  const rel001 = useRel001(companyId, open === 'rel-001');
  const rel002 = useRel002(companyId, open === 'rel-002');
  const rel003 = useRel003(companyId, undefined, undefined, open === 'rel-003');

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo PRD § 13. Cada relatório pode ser visualizado em tela ou
          exportado em CSV (abre direto no Excel).
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <ReportCard
          icon={FileText}
          code="REL-001"
          name="Fornecedores sem CC"
          subtitle="Fornecedores ativos sem pedidos nos últimos 90 dias"
          active={open === 'rel-001'}
          onClick={() => setOpen(open === 'rel-001' ? null : 'rel-001')}
        />
        <ReportCard
          icon={FileBarChart}
          code="REL-002"
          name="Pedidos em atraso > 30 dias"
          subtitle="PCs com entrega vencida há mais de 30 dias e ainda abertos"
          active={open === 'rel-002'}
          onClick={() => setOpen(open === 'rel-002' ? null : 'rel-002')}
        />
        <ReportCard
          icon={Wallet}
          code="REL-003"
          name="Orçamento por Filial/CC"
          subtitle="Consumo do mês corrente — orçado, comprometido e consumido"
          active={open === 'rel-003'}
          onClick={() => setOpen(open === 'rel-003' ? null : 'rel-003')}
        />

        {/* Fase 2 — placeholders */}
        <ReportCard
          icon={FileText}
          code="REL-004"
          name="DDAs sem documento (7d)"
          subtitle="Fase 2 — depende do módulo Financeiro"
          disabled
        />
        <ReportCard
          icon={FileText}
          code="REL-005"
          name="Provisões > 60 dias"
          subtitle="Fase 2 — depende do módulo Financeiro"
          disabled
        />
        <ReportCard
          icon={FileText}
          code="REL-006"
          name="Adiantamentos não compensados > 90 dias"
          subtitle="Fase 2 — depende do módulo Financeiro"
          disabled
        />
        <ReportCard
          icon={FileText}
          code="REL-007"
          name="Matching fiscal pendente > 30 dias"
          subtitle="Fase 2 — depende do módulo de Documentos Fiscais"
          disabled
        />
      </div>

      {/* Painel do relatório aberto */}
      {open === 'rel-001' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>REL-001 — Fornecedores sem CC associado</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportToCsv(
                  `rel-001-fornecedores-sem-cc-${new Date().toISOString().slice(0, 10)}`,
                  [
                    { header: 'Empresa', value: (r) => r.empresa },
                    { header: 'Código', value: (r) => r.codigo },
                    { header: 'Nome', value: (r) => r.nome },
                    { header: 'CNPJ', value: (r) => r.cnpj },
                    { header: 'E-mail', value: (r) => r.email },
                  ],
                  rel001.data ?? [],
                )
              }
              disabled={!rel001.data || rel001.data.length === 0}
            >
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </CardHeader>
          <CardContent>
            {rel001.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (rel001.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum fornecedor sem CC encontrado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>E-mail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rel001.data ?? []).map((r) => (
                      <TableRow key={`${r.empresa}-${r.codigo}`}>
                        <TableCell>{r.empresa}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.codigo}
                        </TableCell>
                        <TableCell>{r.nome}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.cnpj ?? '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.email ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {open === 'rel-002' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>REL-002 — Pedidos em atraso &gt; 30 dias</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportToCsv(
                  `rel-002-atrasados-30d-${new Date().toISOString().slice(0, 10)}`,
                  [
                    { header: 'Número', value: (r) => r.numero },
                    { header: 'Fornecedor', value: (r) => r.fornecedor },
                    { header: 'Filial', value: (r) => r.filial },
                    { header: 'Comprador', value: (r) => r.comprador },
                    { header: 'Status', value: (r) => r.status },
                    { header: 'Valor', value: (r) => r.valor },
                    {
                      header: 'Entrega prevista',
                      value: (r) => r.entregaPrevista,
                    },
                    { header: 'Dias em atraso', value: (r) => r.diasAtraso },
                  ],
                  rel002.data ?? [],
                )
              }
              disabled={!rel002.data || rel002.data.length === 0}
            >
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </CardHeader>
          <CardContent>
            {rel002.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (rel002.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum pedido nesta condição.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead>Comprador</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Entrega prevista</TableHead>
                      <TableHead className="text-right">Atraso (d)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rel002.data ?? []).map((r) => (
                      <TableRow key={r.numero}>
                        <TableCell className="font-medium">{r.numero}</TableCell>
                        <TableCell>{r.fornecedor}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.filial}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.comprador ?? '—'}
                        </TableCell>
                        <TableCell>{r.status}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(r.valor)}
                        </TableCell>
                        <TableCell className="text-destructive">
                          {formatDate(r.entregaPrevista)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-destructive">
                          {r.diasAtraso ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {open === 'rel-003' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>REL-003 — Consumo por Filial × CC (mês corrente)</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportToCsv(
                  `rel-003-orcamento-${new Date().toISOString().slice(0, 10)}`,
                  [
                    { header: 'Ano', value: (r) => r.ano },
                    { header: 'Mês', value: (r) => r.mes },
                    { header: 'Filial', value: (r) => r.filial },
                    { header: 'Centro de Custo', value: (r) => r.centroCusto },
                    { header: 'Orçado', value: (r) => r.orcado },
                    { header: 'Comprometido', value: (r) => r.comprometido },
                    { header: 'Consumido', value: (r) => r.consumido },
                    { header: '% Consumido', value: (r) => r.pctConsumido },
                    { header: 'Saldo', value: (r) => r.saldo },
                  ],
                  rel003.data ?? [],
                )
              }
              disabled={!rel003.data || rel003.data.length === 0}
            >
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </CardHeader>
          <CardContent>
            {rel003.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (rel003.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem orçamento lançado para este período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filial</TableHead>
                      <TableHead>CC</TableHead>
                      <TableHead className="text-right">Orçado</TableHead>
                      <TableHead className="text-right">Comprometido</TableHead>
                      <TableHead className="text-right">Consumido</TableHead>
                      <TableHead className="text-right">% Consumido</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rel003.data ?? []).map((r) => (
                      <TableRow key={`${r.filial}-${r.centroCusto}`}>
                        <TableCell>{r.filial}</TableCell>
                        <TableCell>{r.centroCusto}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(r.orcado)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(r.comprometido)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(r.consumido)}
                        </TableCell>
                        <TableCell
                          className={
                            r.pctConsumido > 100
                              ? 'text-right font-medium text-destructive'
                              : r.pctConsumido > 90
                                ? 'text-right font-medium text-warning'
                                : 'text-right'
                          }
                        >
                          {r.pctConsumido.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(r.saldo)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
function ReportCard({
  icon: Icon,
  code,
  name,
  subtitle,
  active,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  code: string;
  name: string;
  subtitle: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`flex w-full flex-col items-start gap-1 rounded-xl border p-4 text-left transition ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : active
            ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
            : 'hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4" />
        {code}
      </div>
      <div className="font-medium">{name}</div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </button>
  );
}
