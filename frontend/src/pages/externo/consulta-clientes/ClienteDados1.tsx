import { useClienteDados, formatCell } from '@/lib/portal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Aba Dados 1 — ficha cadastral do cliente, em grupos (Cliente/Endereço/Cobrança/Entrega). */
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

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {dados.data.groups.map((g) => (
        <Card key={g.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {g.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1.5 text-sm">
              {g.fields.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="font-medium">{formatCell(f.value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
