import { useQuery } from '@tanstack/react-query';
import { api } from './api';

// ─── tipos ───

export interface PortalArea {
  key: string;
  title: string;
  description: string;
}

/** Item da lista "Meus clientes". */
export interface ClienteListItem {
  codigo: string;
  nome: string;
  razaoSocial: string;
  cidade: string;
  uf: string;
  tipo: string;
  pontualidade: string;
  aReceber: number;
  vencido: number;
  /** Data de cadastro do cliente (ISO yyyy-mm-dd) ou null. */
  dataCadastro: string | null;
  /** Última compra = emissão do último faturamento (ISO yyyy-mm-dd) ou null. */
  ultimaCompra: string | null;
}

export interface ColumnMeta {
  name: string;
  label: string;
}
export interface Grid {
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
}

/** Cabeçalho estruturado do cliente (resumo). */
export interface ClienteHeader {
  nome: string;
  codigo: string;
  razaoSocial: string;
  cnpj: string;
  ie: string;
  cidade: string;
  uf: string;
  tipo: string;
  email: string;
  ddd: string;
  telefone: string;
  pontualidade: string;
}

export interface Dados1 {
  cliente: ClienteHeader;
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

/* ─── Comissões a receber ─── */
export interface ComissaoTitulo {
  cliente: string;
  documento: string;
  vencimento: string | null;
  posicao: string;
  valorAReceber: number;
  taxa: number;
  primeiroPedido: boolean;
  comissao: number;
}
export interface ComissoesResumo {
  total: number;
  aVencer: number;
  vencidos: number;
  titulos: number;
  vencidosTitulos: number;
}
export interface Comissoes {
  resumo: ComissoesResumo;
  titulos: ComissaoTitulo[];
}

export function useComissoes() {
  return useQuery({
    queryKey: ['portal', 'comissoes'],
    queryFn: async () => (await api.get<Comissoes>('/portal/comissoes')).data,
  });
}

const CC = '/portal/consulta-clientes';

export function useClientes() {
  return useQuery({
    queryKey: ['cc', 'clientes'],
    queryFn: async () =>
      (await api.get<{ clientes: ClienteListItem[] }>(`${CC}/clientes`)).data
        .clientes,
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

// ─── formatação ───

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

/** Moeda BRL. */
export function formatMoney(v: number): string {
  return (v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** Data ISO → dd/mm/aaaa. */
export function formatDate(v: unknown): string {
  if (typeof v === 'string' && ISO_DATE.test(v)) {
    return new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }
  return typeof v === 'string' ? v : '—';
}

/** Célula genérica (tabelas de títulos/pedidos). Inteiro = identificador. */
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
  if (typeof v === 'string' && ISO_DATE.test(v)) return formatDate(v);
  return String(v);
}

/** 14 dígitos → CNPJ; 11 → CPF; senão devolve como veio. */
export function formatCnpj(v: string): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 14)
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11)
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v || '—';
}

/** (DDD) telefone. */
export function formatPhone(ddd: string, tel: string): string {
  const t = (tel || '').replace(/\D/g, '');
  if (!t) return '—';
  const num =
    t.length >= 9
      ? t.replace(/(\d{5})(\d{4})/, '$1-$2')
      : t.replace(/(\d{4})(\d{4})/, '$1-$2');
  return ddd ? `(${ddd}) ${num}` : num;
}
