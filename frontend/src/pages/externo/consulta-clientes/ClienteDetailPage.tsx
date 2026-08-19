import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useClienteDados } from '@/lib/portal';
import { ClienteDados1 } from './ClienteDados1';
import { ClienteFaturamentos } from './ClienteFaturamentos';
import { ClienteFinanceiro } from './ClienteFinanceiro';

type Aba = 'dados' | 'faturamentos' | 'financeiro';

const ABAS: { key: Aba; label: string }[] = [
  { key: 'dados', label: 'Dados 1' },
  { key: 'faturamentos', label: 'Faturamentos' },
  { key: 'financeiro', label: 'Financeiro' },
];

/** Cliente selecionado — abas Dados 1 / Faturamentos / Financeiro. */
export function ClienteDetailPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const dados = useClienteDados(codigo);
  const [aba, setAba] = useState<Aba>('dados');

  const nome = dados.data?.cliente ?? '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {nome || 'Cliente'}{' '}
            {codigo && (
              <span className="text-sm font-normal text-muted-foreground">
                ({codigo})
              </span>
            )}
          </h1>
        </div>
        <Link
          to="/externo/consulta-clientes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Clientes
        </Link>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b">
        {ABAS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setAba(a.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              aba === a.key
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'dados' && <ClienteDados1 codigo={codigo} />}
      {aba === 'faturamentos' && <ClienteFaturamentos codigo={codigo} />}
      {aba === 'financeiro' && <ClienteFinanceiro codigo={codigo} />}
    </div>
  );
}
