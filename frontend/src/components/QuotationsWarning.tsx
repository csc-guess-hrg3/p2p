import { AlertTriangle, CheckCircle2, FileText, X } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useQuotationsPolicy } from '@/lib/admin';
import {
  QUOTATION_WAIVER_LABELS,
  type QuotationWaiverReason,
} from '@/lib/requisitions';

interface Props {
  companyId: string | undefined;
  totalAmount: number;
  /**
   * Quantas cotações ANEXADAS (apenas alternativas — a proposta do
   * solicitante conta como Cotação 1 implícita e é somada internamente).
   */
  quotationsCount: number;
  /**
   * Dispensa de cotação (RN-REQ-02 — exceção). Quando preenchida, o
   * banner muda de amarelo (falta cotação) pra azul (dispensa
   * solicitada). O aprovador verá motivo + nota.
   */
  waiverReason?: QuotationWaiverReason | null;
  waiverNote?: string | null;
  /** Quando `true`, mostra o estado "OK" (verde) ao bater a regra. */
  showWhenOk?: boolean;
  /** Linha extra contextual abaixo do aviso. */
  hint?: string;
  /** Callback do botão "Solicitar dispensa" (só renderiza se passado). */
  onRequestWaiver?: () => void;
  /** Callback do botão "Remover dispensa" (só renderiza se passado). */
  onClearWaiver?: () => void;
  className?: string;
}

/**
 * Aviso visual da política de cotações (RN-REQ-02).
 *
 * Estados:
 *   - Total < threshold | regra desligada    → nada
 *   - Cotações insuficientes (sem dispensa)  → amarelo (faltam X cotações)
 *   - Dispensa solicitada                    → azul (motivo + nota)
 *   - Cotações OK                            → verde (opt-in)
 */
export function QuotationsWarning({
  companyId,
  totalAmount,
  quotationsCount,
  waiverReason,
  waiverNote,
  showWhenOk = false,
  hint,
  onRequestWaiver,
  onClearWaiver,
  className = '',
}: Props) {
  const policy = useQuotationsPolicy(companyId);
  if (!policy) return null;

  const { thresholdAmount, minRequired } = policy;
  if (thresholdAmount <= 0) return null;
  if (totalAmount < thresholdAmount) return null;
  if (minRequired <= 0) return null;

  // Dispensa ativa — banner azul, prioritário sobre o de cotação.
  if (waiverReason) {
    return (
      <div
        className={`flex items-start gap-2 rounded-md border border-info/40 bg-info/5 p-3 text-sm ${className}`}
      >
        <FileText className="mt-0.5 size-4 shrink-0 text-info" />
        <div className="flex-1 text-foreground">
          <p className="font-medium text-info">
            Dispensa de cotação — {QUOTATION_WAIVER_LABELS[waiverReason]}
          </p>
          {waiverNote && (
            <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
              {waiverNote}
            </p>
          )}
        </div>
        {onClearWaiver && (
          <button
            type="button"
            onClick={onClearWaiver}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
            title="Remover dispensa e voltar a regra padrão"
          >
            <X className="size-3" />
            Remover
          </button>
        )}
      </div>
    );
  }

  // +1 = a proposta do solicitante conta como Cotação 1 (fornecedor +
  // itens + valor que ele preencheu). Logo, com minRequired=3 e o user
  // anexando 2 cotações ALTERNATIVAS, atende a política.
  const totalCount = quotationsCount + 1;
  const missing = Math.max(0, minRequired - totalCount);
  const ok = missing === 0;
  if (ok && !showWhenOk) return null;

  if (ok) {
    return (
      <div
        className={`flex items-start gap-2 rounded-md border border-success/40 bg-success/5 p-3 text-sm text-success ${className}`}
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Política de cotações atendida</p>
          <p className="text-xs text-success/80">
            {totalCount} de {minRequired} cotações
            {' '}— sua proposta + {quotationsCount} alternativa(s).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm ${className}`}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="flex-1 text-foreground">
        <p className="font-medium text-warning">
          Cotações necessárias acima de {formatCurrency(thresholdAmount)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Esta requisição totaliza{' '}
          <span className="font-semibold text-foreground">
            {formatCurrency(totalAmount)}
          </span>
          . Conforme a política vigente, é necessário anexar mais{' '}
          <span className="font-semibold text-foreground">
            {missing} {missing === 1 ? 'cotação' : 'cotações'}
          </span>
          . Por favor, adicione-as no campo de anexos.
        </p>
        {hint && (
          <p className="mt-1 text-xs italic text-muted-foreground">{hint}</p>
        )}
      </div>
      {onRequestWaiver && (
        <button
          type="button"
          onClick={onRequestWaiver}
          className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-background px-2 py-1 text-xs font-medium text-warning hover:bg-warning/10"
        >
          <FileText className="size-3" />
          Solicitar dispensa
        </button>
      )}
    </div>
  );
}
