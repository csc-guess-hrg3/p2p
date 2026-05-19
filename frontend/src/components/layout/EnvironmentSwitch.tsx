import { ChevronDown, FlaskConical, Server } from 'lucide-react';
import {
  getEnvironment,
  setEnvironment,
  clearToken,
  type AppEnv,
} from '@/lib/api';
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

/** Alterna entre Produção e Homologação. Trocar reinicia a sessão. */
export function EnvironmentSwitch() {
  const current = getEnvironment();
  const isHml = current === 'HML';

  function change(env: AppEnv) {
    if (env === current) return;
    setEnvironment(env);
    // Sessão e empresa são por ambiente — limpa e força novo login.
    clearToken();
    localStorage.removeItem('p2p_company');
    localStorage.removeItem('p2p_refresh');
    window.location.href = '/login';
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
