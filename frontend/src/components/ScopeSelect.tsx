import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type Scope = 'mine' | 'team' | 'all';

/**
 * Estado de escopo das listas, persistido por usuário/tela. Padrão 'mine'
 * (a tela abre no que é do usuário). 'all' só vale pra quem pode (admin);
 * se perder a permissão, cai pra 'team'.
 */
export function useScope(
  storageKey: string,
  canSeeAll: boolean,
): [Scope, (s: Scope) => void] {
  const [scope, setScope] = useState<Scope>(() => {
    const saved = localStorage.getItem(storageKey) as Scope | null;
    if (saved === 'mine' || saved === 'team') return saved;
    if (saved === 'all' && canSeeAll) return 'all';
    return 'mine';
  });

  useEffect(() => {
    localStorage.setItem(storageKey, scope);
  }, [storageKey, scope]);

  useEffect(() => {
    if (scope === 'all' && !canSeeAll) setScope('team');
  }, [scope, canSeeAll]);

  return [scope, setScope];
}

/**
 * Seletor [Meus · Da equipe · Todos]. "Todos" só aparece pra quem pode;
 * "Da equipe" some pra quem não tem equipe.
 */
export function ScopeSelect({
  value,
  onChange,
  canSeeAll,
  showTeam = true,
  className,
}: {
  value: Scope;
  onChange: (s: Scope) => void;
  canSeeAll: boolean;
  showTeam?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Scope)}>
      <SelectTrigger className={className ?? 'w-full sm:w-40'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="mine">Meus</SelectItem>
        {showTeam && <SelectItem value="team">Da equipe</SelectItem>}
        {canSeeAll && <SelectItem value="all">Todos</SelectItem>}
      </SelectContent>
    </Select>
  );
}
