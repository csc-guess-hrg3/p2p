import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import {
  useClienteDados,
  useClienteFaturamentos,
  useClienteFinanceiro,
  formatMoney,
  formatDate,
  formatCnpj,
  formatPhone,
} from '@/lib/portal';
import { ClienteDados1 } from './ClienteDados1';
import { ClienteFaturamentos } from './ClienteFaturamentos';
import { ClienteFinanceiro } from './ClienteFinanceiro';

type Aba = 'cad' | 'fat' | 'fin';
const ABAS: { key: Aba; label: string }[] = [
  { key: 'cad', label: 'Cadastro' },
  { key: 'fat', label: 'Faturamentos' },
  { key: 'fin', label: 'Financeiro' },
];

/** Cliente selecionado — resumo + abas Cadastro / Faturamentos / Financeiro. */
export function ClienteDetailPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const dados = useClienteDados(codigo);
  const fat = useClienteFaturamentos(codigo);
  const fin = useClienteFinanceiro(codigo);
  const [aba, setAba] = useState<Aba>('cad');

  const c = dados.data?.cliente;
  const faturado =
    fat.data?.totais.find((t) => t.label === 'Valor Total')?.value ?? 0;
  const ultima = fat.data?.rows[0]?.EMISSAO;
  const aReceber = fin.data?.aging.total ?? 0;
  const notas = fat.data?.rows.length ?? 0;
  const titulos = fin.data?.titulos.rows.length ?? 0;

  return (
    <div className="space-y-5">
      <Link
        to="/externo/consulta-clientes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Todos os clientes
      </Link>

      {/* Resumo */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">
              {c?.nome ?? 'Cliente'}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
              <span className="font-mono">#{c?.codigo ?? codigo}</span>
              {c?.cnpj && (
                <>
                  <span className="text-muted-foreground/50">•</span>
                  <span>CNPJ {formatCnpj(c.cnpj)}</span>
                </>
              )}
              {(c?.cidade || c?.uf) && (
                <>
                  <span className="text-muted-foreground/50">•</span>
                  <span>{[c?.cidade, c?.uf].filter(Boolean).join(' / ')}</span>
                </>
              )}
              {c?.tipo && (
                <>
                  <span className="text-muted-foreground/50">•</span>
                  <span className="capitalize">{c.tipo.toLowerCase()}</span>
                </>
              )}
            </div>
            {(c?.email || c?.telefone) && (
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {c?.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Mail className="size-3.5" />
                    {c.email.toLowerCase()}
                  </a>
                )}
                {c?.telefone && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="size-3.5" />
                    {formatPhone(c.ddd, c.telefone)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border bg-border sm:grid-cols-3 [&>*]:bg-card">
          <Kpi
            label="A receber"
            value={formatMoney(aReceber)}
            hint={`${titulos} título${titulos === 1 ? '' : 's'}`}
            tone={fin.data && aReceber > 0 ? 'good' : undefined}
          />
          <Kpi
            label="Faturado"
            value={formatMoney(faturado)}
            hint={`${notas} nota${notas === 1 ? '' : 's'}`}
          />
          <Kpi
            label="Última compra"
            value={ultima ? formatDate(ultima) : '—'}
          />
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1.5">
        {ABAS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setAba(a.key)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
              aba === a.key
                ? 'border-foreground bg-foreground text-background'
                : 'bg-card text-muted-foreground hover:border-primary hover:text-foreground'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'cad' && <ClienteDados1 codigo={codigo} />}
      {aba === 'fat' && <ClienteFaturamentos codigo={codigo} />}
      {aba === 'fin' && <ClienteFinanceiro codigo={codigo} />}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
}) {
  const toneCls =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-destructive'
        : '';
  return (
    <div className="p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${toneCls}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}
