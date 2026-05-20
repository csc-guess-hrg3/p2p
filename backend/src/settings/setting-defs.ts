/**
 * Registro dos parâmetros configuráveis da plataforma.
 * Cada parâmetro é definido por empresa (tabela system_settings).
 * Apenas chaves listadas aqui podem ser lidas/gravadas.
 */
export interface SettingDef {
  label: string;
  description: string;
  type: 'number';
  default: string;
  min?: number;
  max?: number;
}

export const SETTING_DEFS: Record<string, SettingDef> = {
  'receiving.divergence_tolerance_pct': {
    label: 'Tolerância de divergência no recebimento (%)',
    description:
      'Percentual de variação aceito sem marcar o recebimento como ' +
      'divergente — aplica-se tanto à quantidade recebida acima do ' +
      'pedido quanto à proporção de itens rejeitados. 0 = qualquer ' +
      'variação aciona divergência.',
    type: 'number',
    default: '0',
    min: 0,
    max: 100,
  },
  // RN-REQ-02 / REQ-08 — exigência de cotações.
  // Quando o valor total da requisição ≥ threshold, exige-se que o solicitante
  // anexe o número mínimo de cotações antes de submeter para aprovação.
  // Default conservador (R$ 10.000) — Admin ajusta por empresa.
  'requisitions.min_quotations_threshold_amount': {
    label: 'Valor mínimo da requisição para exigir cotações (R$)',
    description:
      'A partir deste valor total, o solicitante precisa anexar o número ' +
      'mínimo de cotações configurado abaixo. 0 = nunca exige.',
    type: 'number',
    default: '10000',
    min: 0,
  },
  'requisitions.min_quotations_required': {
    label: 'Número mínimo de cotações exigidas',
    description:
      'Quantas cotações devem ser anexadas quando a requisição atinge o ' +
      'valor mínimo configurado. Padrão PRD § 7.2: 3 cotações.',
    type: 'number',
    default: '3',
    min: 0,
    max: 20,
  },
};

export type SettingKey = keyof typeof SETTING_DEFS;

// Atalhos para evitar string literals espalhadas pelos services.
export const SETTING_KEYS = {
  RECEIVING_DIVERGENCE_TOLERANCE_PCT: 'receiving.divergence_tolerance_pct',
  REQUISITIONS_MIN_QUOTATIONS_THRESHOLD_AMOUNT:
    'requisitions.min_quotations_threshold_amount',
  REQUISITIONS_MIN_QUOTATIONS_REQUIRED: 'requisitions.min_quotations_required',
} as const;
