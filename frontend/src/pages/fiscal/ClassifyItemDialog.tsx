import { useState } from 'react';
import { ArrowLeft, Link2, Plus, Sparkles } from 'lucide-react';
import { extractApiMessage } from '@/lib/api-errors';
import { useToast } from '@/components/ui/use-toast';
import { useAccounts } from '@/lib/integration';
import {
  useItemSuggestions,
  useLinkClassifiedItem,
  useCreateClassifiedItem,
  type ClassificationItem,
  type CreateItemPreview,
} from '@/lib/fiscal';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

/**
 * Classifica um item LIVRE: a equipe fiscal vincula um item que já existe
 * (traz a conta contábil) ou cadastra um novo no Linx. Criar tem passo de
 * PRÉVIA — mostra o item exato antes de gravar.
 */
export function ClassifyItemDialog({
  item,
  companyCode,
  onClose,
}: {
  item: ClassificationItem;
  companyCode?: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const suggestions = useItemSuggestions(item.id);
  const linkMut = useLinkClassifiedItem();
  const createMut = useCreateClassifiedItem();
  const accounts = useAccounts(companyCode);

  const [mode, setMode] = useState<'suggest' | 'create'>('suggest');
  const [preview, setPreview] = useState<CreateItemPreview['item'] | null>(
    null,
  );

  // Form de criação.
  const [descricao, setDescricao] = useState(item.itemDescription);
  const [unidade, setUnidade] = useState(item.unit);
  const [conta, setConta] = useState('');
  const [ncm, setNcm] = useState('');
  const [origem, setOrigem] = useState('');
  const [grupo, setGrupo] = useState('');
  const [tipoSped, setTipoSped] = useState('');
  const [cfop, setCfop] = useState('');

  async function handleLink(itemErpCode: string) {
    try {
      await linkMut.mutateAsync({ reqItemId: item.id, itemErpCode });
      toast({ title: 'Item vinculado', variant: 'success' });
      onClose();
    } catch (err) {
      toast({
        title: 'Não foi possível vincular',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  function buildDto(confirm: boolean) {
    return {
      accountingAccount: conta,
      descricao: descricao.trim() || undefined,
      unidade: unidade.trim() || undefined,
      ncm: ncm.trim() || undefined,
      origem: origem.trim() || undefined,
      grupo: grupo.trim() || undefined,
      tipoSped: tipoSped.trim() || undefined,
      cfop: cfop.trim() ? Number(cfop) : undefined,
      confirm,
    };
  }

  async function handlePreview() {
    if (!conta) {
      toast({ title: 'Escolha a conta contábil', variant: 'destructive' });
      return;
    }
    try {
      const res = (await createMut.mutateAsync({
        reqItemId: item.id,
        dto: buildDto(false),
      })) as CreateItemPreview;
      setPreview(res.item);
    } catch (err) {
      toast({
        title: 'Não foi possível gerar a prévia',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  async function handleConfirmCreate() {
    try {
      await createMut.mutateAsync({ reqItemId: item.id, dto: buildDto(true) });
      toast({ title: 'Item criado no Linx e vinculado', variant: 'success' });
      onClose();
    } catch (err) {
      toast({
        title: 'Não foi possível gravar o item',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  const sugs = suggestions.data?.suggestions ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Classificar item</DialogTitle>
          <DialogDescription>
            {item.requisition.number} · {item.requisition.supplierName} ·{' '}
            {formatNumber(item.quantity)} {item.unit}
          </DialogDescription>
        </DialogHeader>

        {/* O que o solicitante escreveu */}
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Descrição do solicitante: </span>
          <span className="font-medium">{item.itemDescription}</span>
        </div>

        {mode === 'suggest' && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3.5" /> Itens parecidos já no Linx
            </div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {suggestions.isLoading && (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  Buscando itens parecidos…
                </p>
              )}
              {!suggestions.isLoading && sugs.length === 0 && (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  Nenhum item parecido encontrado. Cadastre um novo abaixo.
                </p>
              )}
              {sugs.map((s) => (
                <div
                  key={s.codigo}
                  className="flex items-center justify-between gap-3 rounded-md border p-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {s.descricao}
                      </span>
                      {s.linked && (
                        <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success">
                          do fornecedor
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {s.codigo}
                      {s.contaContabilPadrao
                        ? ` · conta ${s.contaContabilPadrao}`
                        : ' · sem conta'}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={linkMut.isPending || !s.contaContabilPadrao}
                    onClick={() => handleLink(s.codigo)}
                  >
                    <Link2 className="size-4" /> Vincular
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'create' && !preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Descrição do item</Label>
                <Input
                  value={descricao}
                  maxLength={80}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Input
                  value={unidade}
                  maxLength={5}
                  onChange={(e) => setUnidade(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Conta contábil <span className="text-destructive">*</span>
                </Label>
                <Select value={conta} onValueChange={setConta}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts.data ?? []).map((a) => (
                      <SelectItem key={a.codigo} value={a.codigo}>
                        {a.codigo} — {a.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <details className="rounded-md border">
              <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">
                Campos fiscais (opcionais — só se precisar)
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t p-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>NCM</Label>
                  <Input
                    value={ncm}
                    placeholder="00000000 (padrão)"
                    onChange={(e) => setNcm(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Origem</Label>
                  <Input
                    value={origem}
                    placeholder="0 = nacional (padrão)"
                    onChange={(e) => setOrigem(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Grupo fiscal</Label>
                  <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo SPED</Label>
                  <Input
                    value={tipoSped}
                    onChange={(e) => setTipoSped(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Indicador CFOP</Label>
                  <Input
                    value={cfop}
                    inputMode="numeric"
                    onChange={(e) => setCfop(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
            </details>
          </div>
        )}

        {/* PRÉVIA — o item exato que será gravado no Linx */}
        {mode === 'create' && preview && (
          <div className="space-y-2 rounded-md border border-info/40 bg-info/5 p-3 text-sm">
            <p className="font-medium text-info">
              Confira o item que será gravado no Linx
            </p>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Código (novo)</dt>
              <dd className="font-medium">{preview.codigo}</dd>
              <dt className="text-muted-foreground">Descrição</dt>
              <dd>{preview.descricao}</dd>
              <dt className="text-muted-foreground">Unidade</dt>
              <dd>{preview.unidade}</dd>
              <dt className="text-muted-foreground">Conta contábil</dt>
              <dd>
                {preview.contaContabil}
                {preview.contaNome ? ` — ${preview.contaNome}` : ''}
              </dd>
              <dt className="text-muted-foreground">NCM</dt>
              <dd>{preview.ncm}</dd>
              <dt className="text-muted-foreground">Origem</dt>
              <dd>{preview.origem}</dd>
              {preview.grupo && (
                <>
                  <dt className="text-muted-foreground">Grupo</dt>
                  <dd>{preview.grupo}</dd>
                </>
              )}
              {preview.tipoSped && (
                <>
                  <dt className="text-muted-foreground">Tipo SPED</dt>
                  <dd>{preview.tipoSped}</dd>
                </>
              )}
              {preview.cfop != null && (
                <>
                  <dt className="text-muted-foreground">CFOP</dt>
                  <dd>{preview.cfop}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {mode === 'suggest' ? (
            <>
              <span className="text-xs text-muted-foreground">
                Nenhum serve?
              </span>
              <Button variant="outline" onClick={() => setMode('create')}>
                <Plus className="size-4" /> Cadastrar item novo
              </Button>
            </>
          ) : preview ? (
            <>
              <Button variant="outline" onClick={() => setPreview(null)}>
                <ArrowLeft className="size-4" /> Editar
              </Button>
              <Button
                onClick={handleConfirmCreate}
                disabled={createMut.isPending}
              >
                {createMut.isPending ? 'Gravando…' : 'Gravar no Linx'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setMode('suggest')}>
                <ArrowLeft className="size-4" /> Ver sugestões
              </Button>
              <Button onClick={handlePreview} disabled={createMut.isPending}>
                {createMut.isPending ? 'Gerando…' : 'Prever item'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
