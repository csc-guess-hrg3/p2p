import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Link as LinkIcon, X, Ban, Undo2 } from 'lucide-react';
import {
  useFiscalDocument,
  useFiscalDocCandidates,
  useFiscalDocLegacyCandidates,
  useLinkFiscalDocument,
  useLinkFiscalToLegacy,
  useUnlinkFiscalDocument,
  useIgnoreFiscalDocument,
  useRestoreFiscalDocument,
  downloadFiscalXml,
  downloadFiscalDanfe,
  statusLabel,
} from '@/lib/fiscal-documents';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { useToast } from '@/components/ui/use-toast';
import { extractApiMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';

export function FiscalDocumentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: doc, isLoading } = useFiscalDocument(id);
  const [linkOpen, setLinkOpen] = useState(false);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');

  const unlinkMut = useUnlinkFiscalDocument();
  const ignoreMut = useIgnoreFiscalDocument();
  const restoreMut = useRestoreFiscalDocument();

  if (isLoading || !doc) {
    return (
      <div className="p-6 text-muted-foreground">Carregando…</div>
    );
  }

  async function tryDownload(kind: 'xml' | 'danfe') {
    try {
      if (kind === 'xml')
        await downloadFiscalXml({ id: doc!.id, accessKey: doc!.accessKey });
      else
        await downloadFiscalDanfe({ id: doc!.id, accessKey: doc!.accessKey });
    } catch (err) {
      toast({
        title: 'Falha no download',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  async function handleUnlink() {
    try {
      await unlinkMut.mutateAsync(doc!.id);
      toast({ title: 'NF desvinculada.' });
    } catch (err) {
      toast({
        title: 'Falha',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  async function handleIgnore() {
    try {
      await ignoreMut.mutateAsync({
        id: doc!.id,
        reason: ignoreReason || undefined,
      });
      toast({ title: 'NF marcada como ignorada.' });
      setIgnoreOpen(false);
      setIgnoreReason('');
    } catch (err) {
      toast({
        title: 'Falha',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  async function handleRestore() {
    try {
      await restoreMut.mutateAsync(doc!.id);
      toast({ title: 'NF voltou para Pendentes.' });
    } catch (err) {
      toast({
        title: 'Falha',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/fiscal/notas-fiscais')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => tryDownload('xml')}>
            <Download className="mr-2 h-4 w-4" />
            XML
          </Button>
          <Button variant="outline" size="sm" onClick={() => tryDownload('danfe')}>
            <Download className="mr-2 h-4 w-4" />
            DANFe (PDF)
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              NF-e {doc.numero}
              {doc.serie ? ` / série ${doc.serie}` : ''} — {doc.company.code}
            </div>
            <h1 className="text-xl font-semibold">{doc.supplierName}</h1>
            <div className="text-sm text-muted-foreground">
              CNPJ emitente {formatCnpj(doc.supplierCnpj)} • Emissão{' '}
              {formatDate(doc.emissao)} • Total{' '}
              <span className="font-mono">{formatCurrency(doc.valorTotal)}</span>
            </div>
            {doc.natOp && (
              <div className="text-xs text-muted-foreground">
                Natureza: {doc.natOp}
              </div>
            )}
          </div>
          <StatusBadge status={statusLabel(doc.status)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Destinatário</h2>
          <div className="text-sm">{doc.destName ?? '—'}</div>
          <div className="text-xs text-muted-foreground">
            CNPJ {formatCnpj(doc.destCnpj)}
          </div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Chave de acesso</h2>
          <div className="break-all font-mono text-xs">{doc.accessKey}</div>
        </div>
      </div>

      <div className="rounded-md border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Vínculo com PC</h2>
        {doc.status === 'LEGACY_LINKED' && doc.legacyPedido ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">
                Vinculada ao pedido{' '}
                <button
                  className="font-medium text-primary hover:underline"
                  onClick={() =>
                    navigate(
                      `/legacy-orders/${doc.legacyCompanyId}/${doc.legacyPedido}`,
                    )
                  }
                >
                  {doc.legacyPedido}
                </button>{' '}
                (origem Linx).
              </div>
              {doc.linkedBy && (
                <div className="text-xs text-muted-foreground">
                  Por {doc.linkedBy.name} em {formatDateTime(doc.linkedAt)}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlink}
              disabled={unlinkMut.isPending}
            >
              <X className="mr-2 h-4 w-4" />
              Desvincular
            </Button>
          </div>
        ) : doc.status === 'LINKED' && doc.purchaseOrder ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">
                Vinculada ao PC{' '}
                <button
                  className="font-medium text-primary hover:underline"
                  onClick={() =>
                    navigate(`/pedidos/${doc.purchaseOrder!.id}`)
                  }
                >
                  {doc.purchaseOrder.number}
                </button>
              </div>
              {doc.linkedBy && (
                <div className="text-xs text-muted-foreground">
                  Por {doc.linkedBy.name} em {formatDateTime(doc.linkedAt)}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlink}
              disabled={unlinkMut.isPending}
            >
              <X className="mr-2 h-4 w-4" />
              Desvincular
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {doc.status === 'INTERNAL'
                ? 'Transferência interna — não precisa de PC.'
                : doc.status === 'IGNORED'
                  ? 'Marcada como ignorada.'
                  : 'Ainda não vinculada a um PC.'}
              {doc.notes && (
                <div className="mt-1 text-xs italic">"{doc.notes}"</div>
              )}
            </div>
            <div className="flex gap-2">
              {doc.status !== 'IGNORED' && doc.status !== 'INTERNAL' && (
                <Button size="sm" onClick={() => setLinkOpen(true)}>
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Vincular a PC
                </Button>
              )}
              {doc.status === 'PENDING' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIgnoreOpen(true)}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Ignorar
                </Button>
              )}
              {(doc.status === 'IGNORED' || doc.status === 'INTERNAL') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestore}
                  disabled={restoreMut.isPending}
                >
                  <Undo2 className="mr-2 h-4 w-4" />
                  Voltar p/ Pendentes
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <div className="border-b p-3 text-sm font-semibold">
          Itens da NF ({doc.items.length})
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Código (forn.)</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>NCM / CFOP</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Vlr unit.</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doc.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  Sem itens (NF de serviço ou estrutura incomum).
                </TableCell>
              </TableRow>
            ) : (
              doc.items.map((it) => (
                <TableRow key={it.num}>
                  <TableCell>{it.num}</TableCell>
                  <TableCell className="font-mono text-xs">{it.cProd}</TableCell>
                  <TableCell>{it.xProd}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {it.ncm ?? '—'} / {it.cfop ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {it.qCom} {it.uCom ?? ''}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(it.vUnCom)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(it.vProd)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <LinkDialog
        open={linkOpen}
        docId={doc.id}
        onClose={() => setLinkOpen(false)}
        onLinked={() => {
          setLinkOpen(false);
          toast({ title: 'NF vinculada ao PC.' });
        }}
      />

      <Dialog open={ignoreOpen} onOpenChange={setIgnoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar NF como ignorada</DialogTitle>
            <DialogDescription>
              Use para devolução, transferência ou qualquer NF que não vire PC.
              Você pode reverter para "Pendente" depois.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo (opcional)"
            value={ignoreReason}
            onChange={(e) => setIgnoreReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIgnoreOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleIgnore} disabled={ignoreMut.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinkDialog({
  open,
  docId,
  onClose,
  onLinked,
}: {
  open: boolean;
  docId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { data: legacyCandidates, isLoading: loadingLegacy } =
    useFiscalDocLegacyCandidates(open ? docId : null);
  const { data: candidates, isLoading } = useFiscalDocCandidates(
    open ? docId : null,
  );
  const linkMut = useLinkFiscalDocument();
  const linkLegacyMut = useLinkFiscalToLegacy();
  const { toast } = useToast();
  /**
   * Selecionado pode ser:
   *  - { type: 'p2p', poId }            → vincular a PC do P2P
   *  - { type: 'legacy', pedido, companyId } → vincular a pedido Linx
   */
  const [selected, setSelected] = useState<
    | { type: 'p2p'; poId: string }
    | { type: 'legacy'; pedido: string; companyId: string }
    | null
  >(null);

  async function handleConfirm() {
    if (!selected) return;
    try {
      if (selected.type === 'p2p') {
        await linkMut.mutateAsync({
          id: docId,
          purchaseOrderId: selected.poId,
        });
      } else {
        await linkLegacyMut.mutateAsync({
          id: docId,
          legacyPedido: selected.pedido,
          legacyCompanyId: selected.companyId,
        });
      }
      onLinked();
    } catch (err) {
      toast({
        title: 'Falha ao vincular',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vincular NF a um pedido</DialogTitle>
          <DialogDescription>
            Pedidos do Linx onde essa NF já está lançada e PCs do P2P do
            mesmo fornecedor. Escolha um.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[28rem] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(loadingLegacy || isLoading) &&
              !legacyCandidates?.length &&
              !candidates?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground"
                  >
                    Buscando candidatos no Linx e no P2P…
                  </TableCell>
                </TableRow>
              ) : !legacyCandidates?.length && !candidates?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-xs text-muted-foreground"
                  >
                    Nenhum pedido encontrado. A NF pode ainda não estar
                    lançada no Linx ou pertence a um fornecedor sem PC no P2P.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {(legacyCandidates ?? []).map((lc) => {
                    const isSel =
                      selected?.type === 'legacy' &&
                      selected.pedido === lc.pedido;
                    return (
                      <TableRow
                        key={`legacy-${lc.pedido}`}
                        className={`cursor-pointer ${
                          isSel ? 'bg-accent/60' : ''
                        }`}
                        onClick={() =>
                          setSelected({
                            type: 'legacy',
                            pedido: lc.pedido,
                            companyId: lc.companyId,
                          })
                        }
                      >
                        <TableCell>
                          <input
                            type="radio"
                            checked={isSel}
                            onChange={() =>
                              setSelected({
                                type: 'legacy',
                                pedido: lc.pedido,
                                companyId: lc.companyId,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                            Linx
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">{lc.pedido}</TableCell>
                        <TableCell className="text-xs">
                          {lc.statusCompra ?? '—'}
                        </TableCell>
                        <TableCell>{lc.fornecedor}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {lc.filialAEntregar ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(lc.totValorOriginal)}
                        </TableCell>
                        <TableCell>{formatDate(lc.emissao)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(candidates ?? []).map((c) => {
                    const isSel =
                      selected?.type === 'p2p' && selected.poId === c.id;
                    return (
                      <TableRow
                        key={`p2p-${c.id}`}
                        className={`cursor-pointer ${
                          isSel ? 'bg-accent/60' : ''
                        }`}
                        onClick={() =>
                          setSelected({ type: 'p2p', poId: c.id })
                        }
                      >
                        <TableCell>
                          <input
                            type="radio"
                            checked={isSel}
                            onChange={() =>
                              setSelected({ type: 'p2p', poId: c.id })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                            P2P
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">{c.number}</TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell>{c.supplierName}</TableCell>
                        <TableCell className="font-mono text-xs">—</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(c.totalAmount)}
                        </TableCell>
                        <TableCell>{formatDate(c.expectedDelivery)}</TableCell>
                      </TableRow>
                    );
                  })}
                </>
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !selected || linkMut.isPending || linkLegacyMut.isPending
            }
          >
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatCnpj(raw: string): string {
  const c = raw.replace(/\D/g, '');
  if (c.length !== 14) return raw;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(
    8,
    12,
  )}-${c.slice(12)}`;
}
