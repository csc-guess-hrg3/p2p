import { useQuery } from '@tanstack/react-query';
import { api } from './api';

// ─── tipos ───

export interface PortalArea {
  key: string;
  title: string;
  description: string;
}

export interface ColumnMeta {
  name: string;
  label: string;
}
export interface Grid {
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
}

export interface Dados1 {
  cliente: string;
  codigo: unknown;
  groups: { title: string; fields: { label: string; value: unknown }[] }[];
}

export interface Faturamentos extends Grid {
  cliente: string;
  totais: { label: string; value: number; money: boolean }[];
}

export interface AgingBucket {
  d7: number;
  d30: number;
  maior30: number;
  total: number;
}
export interface Financeiro {
  cliente: string;
  aging: { vencidos: AgingBucket; aVencer: AgingBucket; total: number };
  titulos: Grid;
}

// ─── hooks ───

export function useAreas() {
  return useQuery({
    queryKey: ['portal', 'areas'],
    queryFn: async () => (await api.get<PortalArea[]>('/portal/areas')).data,
  });
}

const CC = '/portal/consulta-clientes';

export function useClientes() {
  return useQuery({
    queryKey: ['cc', 'clientes'],
    queryFn: async () => (await api.get<Grid>(`${CC}/clientes`)).data,
  });
}

export function useClienteDados(codigo: string | undefined) {
  return useQuery({
    queryKey: ['cc', 'dados', codigo],
    enabled: !!codigo,
    queryFn: async () =>
      (await api.get<Dados1>(`${CC}/clientes/${codigo}/dados`)).data,
  });
}

export function useClienteFaturamentos(codigo: string | undefined) {
  return useQuery({
    queryKey: ['cc', 'faturamentos', codigo],
    enabled: !!codigo,
    queryFn: async () =>
      (await api.get<Faturamentos>(`${CC}/clientes/${codigo}/faturamentos`))
        .data,
  });
}

export function usePedidosNota(
  codigo: string | undefined,
  nota: { nf: string; serie: string; filial: string } | null,
) {
  return useQuery({
    queryKey: ['cc', 'pedidos', codigo, nota?.nf, nota?.serie, nota?.filial],
    enabled: !!codigo && !!nota,
    queryFn: async () =>
      (
        await api.get<Grid>(`${CC}/clientes/${codigo}/pedidos-nota`, {
          params: nota ?? {},
        })
      ).data,
  });
}

export function useClienteFinanceiro(codigo: string | undefined) {
  return useQuery({
    queryKey: ['cc', 'financeiro', codigo],
    enabled: !!codigo,
    queryFn: async () =>
      (await api.get<Financeiro>(`${CC}/clientes/${codigo}/financeiro`)).data,
  });
}

// ─── formatação de célula ───

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

/** Formata um valor cru p/ exibição. Inteiro = identificador (sem milhar). */
export function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? String(v)
      : v.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  }
  if (typeof v === 'string' && ISO_DATE.test(v)) {
    return new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }
  return String(v);
}

/** Moeda BRL. */
export function formatMoney(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
