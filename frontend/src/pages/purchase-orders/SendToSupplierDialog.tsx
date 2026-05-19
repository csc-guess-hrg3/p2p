import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useSuppliers } from '@/lib/integration';
import {
  useResendToSupplier,
  useSendToSupplier,
  type PurchaseOrder,
} from '@/lib/purchase-orders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  po: PurchaseOrder;
  /** true = primeiro envio (grava no ERP + e-mail). false = reenvio do e-mail */
  mode: 'send' | 'resend';
  /** code da empresa (GUESS/HERING) — para buscar o e-mail no ERP */
  companyCode: string;
}

const SKIP_PREVIEW_KEY = 'p2p_skip_send_preview';

/**
 * Preview do envio do PC ao fornecedor. Permite editar destinatário,
 * assunto e corpo do e-mail. Tem opção "não notificar" (grava no ERP
 * mas não manda e-mail) e checkbox "não mostrar mais" para o usuário
 * pular essa tela em envios futuros (preferência local).
 */
export function SendToSupplierDialog({
  open,
  onOpenChange,
  po,
  mode,
  companyCode,
}: Props) {
  const sendMut = useSendToSupplier();
  const resendMut = useResendToSupplier();

  // Busca dados do fornecedor (incluindo e-mail) — leitura ao vivo do ERP.
  const { data: suppliers } = useSuppliers(companyCode);
  const supplier = suppliers?.find((s) => s.codigo === po.supplierErpCode);
  const defaultEmail = supplier?.email?.trim() ?? '';

  const [recipientEmail, setRecipientEmail] = useState(defaultEmail);
  const [skipEmail, setSkipEmail] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = sendMut.isPending || resendMut.isPending;

  async function handleConfirm() {
    setError(null);
    try {
      if (dontShowAgain) {
        localStorage.setItem(SKIP_PREVIEW_KEY, 'true');
      }
      const payload = {
        id: po.id,
        recipientEmail: recipientEmail.trim() || undefined,
        skipEmail: mode === 'send' ? skipEmail : false,
        subject: subject.trim() || undefined,
        bodyText: body.trim() || undefined,
      };
      if (mode === 'send') {
        await sendMut.mutateAsync(payload);
      } else {
        await resendMut.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data?.message) {
        const m = err.response.data.message;
        setError(Array.isArray(m) ? m.join(' ') : String(m));
      } else {
        setError('Não foi possível enviar o pedido.');
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'send'
              ? 'Enviar pedido ao fornecedor'
              : 'Reenviar e-mail ao fornecedor'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'send'
              ? 'Confira o e-mail antes de gravar no ERP e enviar ao fornecedor.'
              : 'O pedido já está no ERP. Apenas o e-mail será reenviado.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === 'send' && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="text-sm">
                <p className="font-medium">Não notificar o fornecedor</p>
                <p className="text-xs text-muted-foreground">
                  Grava o pedido no ERP mas não envia o e-mail.
                </p>
              </div>
              <Switch checked={skipEmail} onCheckedChange={setSkipEmail} />
            </div>
          )}

          {!skipEmail && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="recipient">Destinatário</Label>
                <Input
                  id="recipient"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder={
                    defaultEmail
                      ? defaultEmail
                      : 'Fornecedor sem e-mail cadastrado — informe aqui'
                  }
                />
                {!defaultEmail && (
                  <p className="text-xs text-muted-foreground">
                    O fornecedor não tem e-mail no cadastro do ERP.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="subject">Assunto (opcional)</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={`Pedido de Compra ${po.number}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="body">Corpo (opcional)</Label>
                <Textarea
                  id="body"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Texto livre. PDF do pedido vai como anexo."
                />
              </div>
            </>
          )}

          {mode === 'send' && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
              />
              Não exibir esta pré-visualização novamente
            </label>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy
              ? 'Enviando…'
              : mode === 'send'
                ? skipEmail
                  ? 'Gravar no ERP'
                  : 'Enviar'
                : 'Reenviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function shouldSkipSendPreview(): boolean {
  return localStorage.getItem(SKIP_PREVIEW_KEY) === 'true';
}
