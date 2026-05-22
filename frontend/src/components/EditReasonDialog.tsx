import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  placeholder?: string;
  minLength?: number;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}

/**
 * Diálogo genérico para coletar um motivo (mín. N chars) antes de uma
 * ação que reabre o fluxo de aprovação (edição de Requisição/PC,
 * cancelamento, devolução para revisão).
 */
export function EditReasonDialog({
  open,
  onOpenChange,
  title = 'Motivo da edição',
  description = 'Esta ação reinicia o fluxo de aprovação. Informe o motivo para o histórico.',
  placeholder = 'Ex.: ajuste de preço negociado com o fornecedor',
  minLength = 5,
  confirmLabel = 'Salvar e reenviar para aprovação',
  pending = false,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < minLength;

  async function handle() {
    if (tooShort || pending) return;
    await onConfirm(reason.trim());
    setReason('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason('');
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Motivo (mínimo {minLength} caracteres)</Label>
          <Textarea
            rows={4}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
          />
          <p className="text-xs text-muted-foreground">
            {reason.trim().length}/{minLength}+ caracteres
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={handle} disabled={tooShort || pending}>
            {pending ? 'Salvando…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
