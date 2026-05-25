import { ChevronDown, FlaskConical, Server } from 'lucide-react';
import { getEnvironment, setEnvironment, type AppEnv } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuCheckItem,
} from '@/components/ui/dropdown-menu';

const ENVS: { value: AppEnv; label: string }[] = [
  { value: 'PROD', label: 'Produção' },
  { value: 'HML', label: 'Homologação' },
];

/**
 * Alterna entre Produção e Homologação.
 *
 * A troca é transparente: o login LDAP é o mesmo nos dois ambientes e o
 * JWT é portável (resolvido pelo usuário de rede), então a sessão é
 * mantida. Só muda o servidor/banco de destino. A empresa ativa é por
 * ambiente, então é limpa para o app re-selecionar a partir do /auth/me.
 */
export function EnvironmentSwitch() {
  const { user } = useAuth();
  const current = getEnvironment();
  const isHml = current === 'HML';

  // Apenas Admin pode alternar entre PROD e HML — usuários comuns sempre
  // operam no ambiente de produção. Mantemos um indicador discreto quando
  // o admin está em HML pra não esquecer (cor de aviso).
  if (user?.profile !== 'ADMIN') return null;

  function change(env: AppEnv) {
    if (env === current) return;
    setEnvironment(env);
    // A empresa ativa usa IDs por ambiente — limpa para re-selecionar.
    localStorage.removeItem('p2p_company');
    // Mantém o token; recarrega para refazer as queries no novo backend.
    window.location.href = '/';
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium',
          isHml
            ? 'border-warning/40 bg-warning/10 text-warning'
            : 'hover:bg-accent',
        )}
      >
        {isHml ? (
          <FlaskConical className="size-4" />
        ) : (
          <Server className="size-4 text-muted-foreground" />
        )}
        {isHml ? 'Homologação' : 'Produção'}
        <ChevronDown className="size-4 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Ambiente</DropdownMenuLabel>
        {ENVS.map((e) => (
          <DropdownMenuCheckItem
            key={e.value}
            checked={e.value === current}
            onSelect={() => change(e.value)}
          >
            {e.label}
          </DropdownMenuCheckItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
