/** Formata um valor monetário em Real (R$). */
export function formatCurrency(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** Formata uma data ISO em dd/mm/aaaa. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** Formata data e hora ISO em dd/mm/aaaa hh:mm. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** Formata um número com casas decimais no padrão pt-BR. */
export function formatNumber(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 4,
  });
}
