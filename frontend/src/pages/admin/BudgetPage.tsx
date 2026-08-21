import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useBranches, useCcRateios } from '@/lib/integration';
import {
  useBudgetConfig,
  useSetBudgetConfig,
  useBudgetConsumption,
  useUpsertBudgetEntry,
} from '@/lib/budget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TableStatusRow } from '@/components/TableStatusRow';
import { useToast } from '@/components/ui/use-toast';
import { extractApiMessage } from '@/lib/api-errors';

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function BudgetPage() {
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;
  const code = activeCompany?.code;

  const [year, setYear] = useState(new Date().getFullYear());

  const config = useBudgetConfig(companyId);
  const setConfig = useSetBudgetConfig(companyId);
  const consumption = useBudgetConsumption(companyId, year);
  const upsert = useUpsertBudgetEntry(companyId);

  const { data: branches = [] } = useBranches(code);
  const { data: ccRateios = [] } = useCcRateios(code);

  // Centros de custo distintos, extraídos das linhas dos rateios de CC.
  const costCenters = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of ccRateios)
      for (const l of r.linhas)
        if (l.centroCustoCodigo) map.set(l.centroCustoCodigo, l.centroCustoCodigo);
    return [...map.keys()].sort();
  }, [ccRateios]);

  const [form, setForm] = useState({
    branchErpCode: '',
    costCenterErpCode: '',
    month: 1,
    amount: '',
  });

  async function saveConfig(patch: {
    enabled?: boolean;
    policy?: 'INFORMATIVE' | 'BLOCKING';
  }) {
    try {
      await setConfig.mutateAsync(patch);
    } catch (err) {
      toast({
        title: 'Falha ao salvar',
        description: extractApiMessage(err, 'Tente novamente.'),
        variant: 'destructive',
      });
    }
  }

  async function saveEntry() {
    if (!form.branchErpCode || !form.costCenterErpCode || !(Number(form.amount) >= 0))
      return;
    try {
      await upsert.mutateAsync({
        branchErpCode: form.branchErpCode,
        costCenterErpCode: form.costCenterErpCode,
        year,
        month: form.month,
        amountBudgeted: Number(form.amount),
      });
      toast({ title: 'Orçamento lançado', variant: 'success' });
      setForm((f) => ({ ...f, amount: '' }));
    } catch (err) {
      toast({
        title: 'Falha ao lançar',
        description: extractApiMessage(err, 'Tente novamente.'),
        variant: 'destructive',
      });
    }
  }

  const cfg = config.data;

  return (
    <div className="space-y-4 pb-10">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin">
          <ArrowLeft className="size-4" />
          Administração
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Controle Orçamentário</CardTitle>
          <p className="text-sm text-muted-foreground">
            Orçamento por filial × centro de custo × mês.
            {activeCompany ? ` Empresa: ${activeCompany.name}.` : ''}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={cfg?.enabled ?? false}
                onCheckedChange={(v) => void saveConfig({ enabled: v })}
                aria-label="Ligar controle orçamentário"
              />
              <span className="text-sm">Controle ativo</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">No estouro:</Label>
              <Select
                value={cfg?.policy ?? 'INFORMATIVE'}
                onValueChange={(v) =>
                  void saveConfig({ policy: v as 'INFORMATIVE' | 'BLOCKING' })
                }
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INFORMATIVE">Só avisar</SelectItem>
                  <SelectItem value="BLOCKING">Bloquear</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lançar orçamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div className="space-y-1.5">
              <Label>Filial</Label>
              <Select
                value={form.branchErpCode}
                onValueChange={(v) => setForm((f) => ({ ...f, branchErpCode: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filial…" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.codigo} value={b.codigo}>
                      {b.codigo} — {b.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Centro de custo</Label>
              <Select
                value={form.costCenterErpCode}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, costCenterErpCode: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="CC…" />
                </SelectTrigger>
                <SelectContent>
                  {costCenters.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mês</Label>
              <Select
                value={String(form.month)}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, month: Number(v) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {String(m).padStart(2, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={
                  !form.branchErpCode ||
                  !form.costCenterErpCode ||
                  !(Number(form.amount) >= 0) ||
                  upsert.isPending
                }
                onClick={() => void saveEntry()}
              >
                Salvar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Consumo {year}</CardTitle>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filial</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Orçado</TableHead>
                <TableHead className="text-right">Comprometido</TableHead>
                <TableHead className="text-right">Disponível</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableStatusRow
                colSpan={6}
                isLoading={consumption.isLoading}
                isError={consumption.isError}
                isEmpty={(consumption.data?.cells.length ?? 0) === 0}
                emptyLabel="Sem orçamento ou consumo neste ano."
              />
              {consumption.data?.cells.map((c) => (
                <TableRow
                  key={`${c.branchErpCode}|${c.costCenterErpCode}|${c.month}`}
                >
                  <TableCell>{c.branchErpCode}</TableCell>
                  <TableCell>{c.costCenterErpCode}</TableCell>
                  <TableCell>{String(c.month).padStart(2, '0')}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money.format(c.budgeted)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money.format(c.committed)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      c.exceeded ? 'font-semibold text-destructive' : ''
                    }`}
                  >
                    {money.format(c.available)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {consumption.data && consumption.data.cells.length > 0 && (
            <div className="mt-3 flex justify-end gap-6 text-sm">
              <span>
                Orçado:{' '}
                <b className="tabular-nums">
                  {money.format(consumption.data.totals.budgeted)}
                </b>
              </span>
              <span>
                Comprometido:{' '}
                <b className="tabular-nums">
                  {money.format(consumption.data.totals.committed)}
                </b>
              </span>
              <span>
                Disponível:{' '}
                <b
                  className={`tabular-nums ${
                    consumption.data.totals.available < 0
                      ? 'text-destructive'
                      : ''
                  }`}
                >
                  {money.format(consumption.data.totals.available)}
                </b>
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
