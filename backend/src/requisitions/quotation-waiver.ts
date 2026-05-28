/**
 * Motivos válidos para dispensa de cotação (RN-REQ-02 — exceção).
 *
 * Quando o solicitante alega um destes motivos + escreve uma
 * justificativa (mín. 20 chars), o submit pula a checagem de mínimo
 * de cotações anexadas. O motivo + texto ficam visíveis pro aprovador,
 * que decide se aceita junto com a aprovação normal de alçada.
 */
export const QUOTATION_WAIVER_REASONS = [
  'CONTRATO_VIGENTE',
  'RECORRENTE',
  'UNICO_FORNECEDOR',
  'EMERGENCIA',
  'OUTRO',
] as const;

export type QuotationWaiverReason = (typeof QUOTATION_WAIVER_REASONS)[number];

export const QUOTATION_WAIVER_LABELS: Record<QuotationWaiverReason, string> = {
  CONTRATO_VIGENTE: 'Contrato vigente',
  RECORRENTE: 'Compra recorrente',
  UNICO_FORNECEDOR: 'Fornecedor único',
  EMERGENCIA: 'Emergência',
  OUTRO: 'Outro',
};

export const QUOTATION_WAIVER_MIN_NOTE = 20;

export function isQuotationWaiverReason(
  value: unknown,
): value is QuotationWaiverReason {
  return (
    typeof value === 'string' &&
    (QUOTATION_WAIVER_REASONS as readonly string[]).includes(value)
  );
}
