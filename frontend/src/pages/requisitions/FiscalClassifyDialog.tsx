import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  useComprasTipos,
  useCtbTipoOperacao,
  useNaturezasEntrada,
} from '@/lib/integration';
import { useFiscalClassify, type Requisition } from '@/lib/requisitions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  requisition: Requisition;
  companyCode: string;
}

/**
 * Classificação fiscal da requisição — preenchida pelo Revisor/Fiscal
 * antes da conversão em PC. Tipo de operação contábil (CTB) primeiro,
 * depois natureza filtrada pelo CTB. Opcionalmente sobrescreve o tipo
 * de compra escolhido pelo solicitante.
 */
export function FiscalClassifyDialog({
  open,
  onOpenChange,
  requisition,
  companyCode,
}: Props) {
  const { data: tipos = [] } = useComprasTipos(companyCode);
  const { data: ctbs = [] } = useCtbTipoOperacao(companyCode);

  const [tipoCompra, setTipoCompra] = useState(
    requisition.tipoCompra ?? '',
  );
  const [ctb, setCtb] = useState<number | null>(
    requisition.ctbTipoOperacao ?? null,
  );
  const [natureza, setNatureza] = useState(
    requisition.naturezaEntrada ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  const { data: naturezas = [] } = useNaturezasEntrada(companyCode, ctb);
  const classifyMut = useFiscalClassify();

  // Se o CTB mudar e a natureza atual não pertencer mais, limpa.
  useEffect(() => {
    if (natureza && !naturezas.find((n) => n.codigo === natureza)) {
      setNatureza('');
    }
  }, [ctb, naturezas, natureza]);

  async function handleConfirm() {
    setError(null);
    if (!ctb || !natureza) {
      setError('Informe o tipo de operação e a natureza.');
      return;
    }
    try {
      await classifyMut.mutateAsync({
        id: requisition.id,
        ctbTipoOperacao: ctb,
        naturezaEntrada: natureza,
        tipoCompra: tipoCompra || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data?.message) {
        const m = err.response.data.message;
        setError(Array.isArray(m) ? m.join(' ') : String(m));
      } else {
        setError('Não foi possível salvar a classificação fiscal.');
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Classificação fiscal</DialogTitle>
          <DialogDescription>
            Define CTB_TIPO_OPERACAO e NATUREZA_ENTRADA usados na gravação do
            Pedido de Compra no Linx.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo de compra (opcional)</Label>
            <Select
              value={tipoCompra}
              onValueChange={setTipoCompra}
            >
              <SelectTrigger>
                <SelectValue placeholder="Manter o tipo do solicitante" />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.tipoCompra} value={t.tipoCompra}>
                    {t.tipoCompra}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de operação contábil</Label>
            <Select
              value={ctb != null ? String(ctb) : ''}
              onValueChange={(v) => setCtb(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {ctbs.map((c) => (
                  <SelectItem key={c.codigo} value={String(c.codigo)}>
                    {c.codigo} — {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Natureza de entrada</Label>
            <Select
              value={natureza}
              onValueChange={setNatureza}
              disabled={!ctb}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !ctb ? 'Escolha o tipo de operação primeiro' : 'Selecione'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {naturezas.map((n) => (
                  <SelectItem key={n.codigo} value={n.codigo}>
                    {n.codigo} — {n.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={classifyMut.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={classifyMut.isPending}>
            {classifyMut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
