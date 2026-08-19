import { CornerDownRight } from 'lucide-react';
import { useClienteDados, formatCell, formatCnpj } from '@/lib/portal';

const ADDR_FIELDS = ['Endereço', 'Número', 'Bairro', 'Cep', 'Cidade', 'Uf'];

/** Aba Cadastro — ficha do cliente. Cobrança/entrega colapsam quando iguais. */
export function ClienteDados1({ codigo }: { codigo: string | undefined }) {
  const dados = useClienteDados(codigo);

  if (dados.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (dados.isError || !dados.data) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar a ficha do cliente.
      </p>
    );
  }

  const groups = dados.data.groups;
  const sig = (title: string) => {
    const g = groups.find((x) => x.title === title);
    return ADDR_FIELDS.map(
      (l) => g?.fields.find((f) => f.label === l)?.value ?? '',
    ).join('|');
  };
  const endSig = sig('Endereço');
  const mesmo = (t: string) => sig(t) === endSig && endSig.replace(/\|/g, '') !== '';
  const cobMesmo = mesmo('Cobrança');
  const entMesmo = mesmo('Entrega');

  const visiveis = groups.filter(
    (g) =>
      !(g.title === 'Cobrança' && cobMesmo) &&
      !(g.title === 'Entrega' && entMesmo),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {visiveis.map((g) => (
          <div key={g.title} className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {g.title}
            </h3>
            <dl className="grid grid-cols-[minmax(84px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
              {g.fields.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="font-medium">{fmt(f.label, f.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {(cobMesmo || entMesmo) && (
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <CornerDownRight className="size-4 shrink-0" />
          <span>
            {cobMesmo && entMesmo
              ? 'Cobrança e entrega usam o mesmo endereço do cadastro.'
              : cobMesmo
                ? 'Cobrança usa o mesmo endereço do cadastro.'
                : 'Entrega usa o mesmo endereço do cadastro.'}
          </span>
        </div>
      )}
    </div>
  );
}

function fmt(label: string, value: unknown): string {
  if (typeof value === 'string' && /CNPJ|Cpf/i.test(label)) {
    return formatCnpj(value);
  }
  return formatCell(value);
}
