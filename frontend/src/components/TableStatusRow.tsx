import { TableRow, TableCell } from '@/components/ui/table';

/**
 * Linha única de estado para o corpo de uma tabela: carregando / erro / vazio.
 *
 * Erro NÃO é mascarado como "vazio": quando o backend/ERP falha, a lista
 * mostra a mensagem de erro (destaque destrutivo) em vez de "Nenhum registro"
 * — senão, numa indisponibilidade do ERP, o usuário veria "lista vazia" e
 * poderia agir errado. Retorna null quando há dados (nada a renderizar).
 */
export function TableStatusRow({
  colSpan,
  isLoading,
  isError,
  isEmpty,
  emptyLabel,
}: {
  colSpan: number;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  emptyLabel: string;
}) {
  if (!isLoading && !isError && !isEmpty) return null;
  const showError = !isLoading && isError;
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={`py-8 text-center ${
          showError ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {isLoading
          ? 'Carregando…'
          : showError
            ? 'Não foi possível carregar. Verifique a conexão e tente novamente.'
            : emptyLabel}
      </TableCell>
    </TableRow>
  );
}
