/**
 * Tipos de anexo. Persistidos como string em `attachments.kind`. Usamos
 * `as const` em vez de enum Prisma porque o SQL Server adapter ainda tem
 * limitações com nativeEnums — string com whitelist faz o mesmo trabalho.
 *
 *   - QUOTATION       Cotação/proposta (RN-REQ-02 — conta no mínimo)
 *   - CONTRACT        Contrato vinculado à requisição/PO
 *   - INVOICE         Nota fiscal / boleto
 *   - RECEIPT_PHOTO   Foto/canhoto do recebimento (PRD § 9.1)
 *   - CHECKLIST       Ata de medição / checklist de conformidade
 *   - OTHER           Default — anexo genérico
 */
export const ATTACHMENT_KINDS = [
  'QUOTATION',
  'CONTRACT',
  'INVOICE',
  'RECEIPT_PHOTO',
  'CHECKLIST',
  'OTHER',
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export function isAttachmentKind(value: unknown): value is AttachmentKind {
  return (
    typeof value === 'string' &&
    (ATTACHMENT_KINDS as readonly string[]).includes(value)
  );
}
