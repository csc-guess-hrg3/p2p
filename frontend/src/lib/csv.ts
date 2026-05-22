/**
 * Helpers de export CSV — usados pelas listagens e pela página de
 * relatórios. CSV-PT-BR: separador `;` (Excel BR), CRLF, BOM UTF-8
 * pra abrir corretamente com acentuação no Excel.
 */

function escape(value: unknown): string {
  if (value == null) return '';
  let s: string;
  if (value instanceof Date) {
    s = value.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  } else if (typeof value === 'number') {
    s = value
      .toLocaleString('pt-BR', { maximumFractionDigits: 4 })
      .replace(/ /g, '');
  } else {
    s = String(value);
  }
  // Datas ISO em string → formata como pt-BR.
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(value)
  ) {
    s = new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }
  // Quoting quando precisa (contém ; " \n)
  if (/[;"\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumn<T> {
  header: string;
  /** Função pra extrair o valor da linha. */
  value: (row: T) => unknown;
}

export function rowsToCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escape(c.header)).join(';');
  const body = rows
    .map((r) => columns.map((c) => escape(c.value(r))).join(';'))
    .join('\r\n');
  return header + '\r\n' + body;
}

/**
 * Dispara o download de um CSV gerado em memória.
 * Adiciona BOM UTF-8 para o Excel reconhecer acentos.
 */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Combina rowsToCsv + downloadCsv em uma chamada. */
export function exportToCsv<T>(
  filename: string,
  columns: CsvColumn<T>[],
  rows: T[],
) {
  downloadCsv(filename, rowsToCsv(columns, rows));
}
