const FALLBACK_PUBLIC_MESSAGE =
  'Falha na integracao com o ERP. Acione o suporte com o horario da tentativa.';

const FRIENDLY_BY_TABLE: Record<string, string> = {
  FORNECEDORES: 'Fornecedor nao cadastrado ou invalido no Linx.',
  FILIAIS: 'Filial nao cadastrada ou invalida no Linx.',
  MOEDAS: 'Moeda nao cadastrada ou invalida no Linx.',
  COND_ENT_PGTOS: 'Condicao de pagamento nao cadastrada no Linx.',
  TRANSPORTADORAS: 'Transportadora nao cadastrada ou invalida no Linx.',
  PRODUCAO_PROGRAMA: 'Programa de producao nao encontrado no Linx.',
  COMPRAS_TIPOS: 'Tipo de compra nao cadastrado no Linx.',
  COMPRAS_STATUS: 'Status de compra invalido no Linx.',
  VENDAS: 'Referencia de venda nao encontrada no Linx.',
  CTB_CENTRO_CUSTO_RATEIO: 'Rateio de centro de custo invalido no Linx.',
  CTB_FILIAL_RATEIO: 'Rateio de filial invalido no Linx.',
};

function rawErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err ?? '');
}

function firstKnownFriendly(raw: string): string | null {
  for (const [table, message] of Object.entries(FRIENDLY_BY_TABLE)) {
    if (new RegExp(`\\b${table}\\b`, 'i').test(raw)) return message;
  }
  if (/transaction ended in the trigger/i.test(raw)) {
    return 'O Linx rejeitou a operacao por uma regra interna de validacao.';
  }
  if (/LX_SEQUENCIAL|SEQUENCIAL/i.test(raw)) {
    return 'O Linx nao retornou o numero sequencial esperado.';
  }
  if (/timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(raw)) {
    return 'Tempo limite excedido ao comunicar com o Linx.';
  }
  if (/deadlock/i.test(raw)) {
    return 'O Linx estava ocupado e a operacao foi interrompida. Tente novamente.';
  }
  return null;
}

export function publicErpErrorMessage(err: unknown): string {
  const raw = rawErrorMessage(err);
  return firstKnownFriendly(raw) ?? FALLBACK_PUBLIC_MESSAGE;
}

export function sanitizeErpErrorDetail(err: unknown, maxLength = 1900): string {
  const raw = rawErrorMessage(err).replace(/\s+/g, ' ').trim();
  const friendly = firstKnownFriendly(raw);
  let sanitized = raw || FALLBACK_PUBLIC_MESSAGE;

  sanitized = sanitized
    .replace(/\[[^\]]+\]\.dbo\.\[?[A-Za-z0-9_]+\]?/gi, '[objeto ERP]')
    .replace(/\bdbo\.[A-Za-z0-9_]+\b/gi, '[objeto ERP]')
    .replace(/\b(GUESS_PRODUCAO|HML_GUESS|DB_HRG3|P2P_DB)\b/gi, '[banco]')
    .replace(/\b\d{14}\b/g, '[cnpj]')
    .replace(/\b\d{11}\b/g, '[cpf]');

  if (/\b(SELECT|INSERT|UPDATE|DELETE|EXEC|DECLARE|MERGE)\b/i.test(sanitized)) {
    sanitized = friendly ?? FALLBACK_PUBLIC_MESSAGE;
  }

  return sanitized.slice(0, maxLength);
}
