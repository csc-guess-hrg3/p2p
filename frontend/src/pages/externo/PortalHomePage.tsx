import { Link } from 'react-router-dom';
import { FileBarChart } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePortalReports } from '@/lib/portal';

/** Início do portal — saudação + atalhos para os relatórios do usuário. */
export function PortalHomePage() {
  const { user } = useAuth();
  const reports = usePortalReports();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Olá, {user?.name?.split(' ')[0] ?? 'representante'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Seus relatórios — sempre com os seus dados.
        </p>
      </div>

      {reports.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : reports.isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar seus relatórios. Tente novamente.
        </p>
      ) : (reports.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum relatório disponível para o seu acesso.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(reports.data ?? []).map((r) => (
            <Link
              key={r.key}
              to={`/externo/relatorios/${r.key}`}
              className="flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition hover:shadow-sm"
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <FileBarChart className="size-4" />
                Relatório
              </div>
              <div className="font-medium">{r.title}</div>
              <p className="text-xs text-muted-foreground">{r.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
