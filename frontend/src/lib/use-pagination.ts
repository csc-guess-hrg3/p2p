import { useEffect, useMemo, useState } from 'react';

/**
 * Paginação client-side genérica para listas já carregadas.
 *
 * O backend continua mandando o conjunto filtrado inteiro; aqui só
 * fatiamos pro tamanho da página. Quando o total de linhas cair (filtro
 * mudou, busca apertou), reposicionamos a página atual pra não sobrar
 * num índice vazio.
 */
export function usePagination<T>(rows: T[], initialPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Se filtros encolheram o conjunto, traz a página de volta pro último válido.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  return {
    page,
    setPage,
    pageSize,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    total,
    totalPages,
    pageRows,
  };
}
