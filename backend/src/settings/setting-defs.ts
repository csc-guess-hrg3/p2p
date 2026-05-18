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
};

export type SettingKey = keyof typeof SETTING_DEFS;
