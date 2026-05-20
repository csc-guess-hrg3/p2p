import { cn } from '@/lib/utils';

/**
 * Bloco esqueleto. Usado em lugar de "Carregando…" enquanto queries
 * TanStack ainda estão em isLoading.
 *
 * Ex.:
 *   <Skeleton className="h-10 w-32" />
 *   <Skeleton className="h-4 w-full" />
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
