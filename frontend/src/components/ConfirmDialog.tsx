import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Diálogo de confirmação reutilizável — substitui o `confirm()` nativo
 * do navegador (texto longo, sem estilo, com OK/Cancelar genéricos) por
 * uma UI consistente com o resto da plataforma.
 *
 * Uso típico:
 * ```tsx
 * const [open, setOpen] = useState(false);
 * <ConfirmDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Excluir requisição"
 *   description="Esta ação não pode ser desfeita."
 *   confirmLabel="Excluir"
 *   variant="destructive"
 *   onConfirm={async () => { await deleteMut.mutateAsync(id); }}
 * />
 * ```
 *
 * `onConfirm` pode ser async; o botão fica em loading state enquanto a
 * promise não resolve, e o diálogo fecha automaticamente em sucesso.
 * Erro re-lança pra que o caller decida (toast, etc.) — o dialog não
 * fecha se onConfirm rejeitar.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription className="whitespace-pre-wrap">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Processando…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
