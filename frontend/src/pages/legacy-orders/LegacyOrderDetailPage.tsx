import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import {
  useLegacyOrder,
  downloadLegacyDanfe,
  type LegacyOrderNfe,
} from '@/lib/legacy-orders';
import {
  downloadFiscalXml,
  downloadFiscalDanfe,
} from '@/lib/fiscal-documents';
import { formatCurrency, formatDate } from '@/lib/format';
import { useToast } from '@/components/ui/use-toast';
import { extractApiMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function LegacyOrderDetailPage() {
  const { companyId = '', pedido = '' } = useParams<{
    companyId: string;
    pedido: string;
  }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, error } = useLegacyOrder(companyId, pedido);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Carregando…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-6 text-destructive">
        Pedido não encontrado: {extractApiMessage(error)}
      </div>
    );
  }

  async function handleDownloadNfe(nfe: LegacyOrderNfe, kind: 'xml' | 'danfe') {
    try {
      if (kind === 'xml') {
        if (!nfe.fiscalDocumentId)
          throw new Error('XML não disponível (NF ainda não baixada da Qive)');
        await downloadFiscalXml({
          id: nfe.fiscalDocumentId,
          accessKey: nfe.chaveNfe ?? '',
        });
      } else {
        // Se temos FiscalDocument, vai pelo endpoint dele (mais auditável);
        // senão, read-through por chave.
        if (nfe.fiscalDocumentId) {
          await downloadFiscalDanfe({
            id: nfe.fiscalDocumentId,
            accessKey: nfe.chaveNfe ?? '',
          });
        } else if (nfe.chaveNfe) {
          await downloadLegacyDanfe(nfe.chaveNfe);
        } else {
          throw new Error('NF sem chave de acesso registrada no Linx');
        }
      }
    } catch (err) {
      toast({
        title: 'Falha no download',
        description: extractApiMessage(err) || String((err as Error).message),
        variant: 'destructive',
      });
    }
  }

  const h = data.header;

  return (
    <div className="space-y-4 p-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/legacy-orders')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar
      </Button>

      <div className="rounded-md border bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Pedido Linx — {data.company.code}
        </div>
        <h1 className="text-2xl font-semibold">
          {h.pedido} — {h.fornecedor}
        </h1>
        <div className="text-sm text-muted-foreground">
          Emissão {formatDate(h.emissao)} • Filial {h.filialAEntregar ?? '—'} •
          Tipo {h.tipoCompra ?? '—'}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Info label="Status compra" value={h.statusCompra} />
        <Info label="Status aprovação" value={h.statusAprovacao} />
        <Info label="Aprovado por" value={h.aprovadoPor} />
        <Info label="Requerido por" value={h.requeridoPor} />
        <Info label="Condição pgto" value={h.condicaoPgto} />
        <Info label="Transportadora" value={h.transportadora} />
        <Info
          label="Total original"
          value={formatCurrency(h.totValorOriginal)}
        />
        <Info
          label="Saldo a entregar (valor)"
          value={formatCurrency(h.totValorEntregar)}
        />
        <Info
          label="Saldo a entregar (qtde)"
          value={String(h.totQtdeEntregar)}
        />
      </div>

      {h.obs && (
        <div className="rounded-md border bg-card p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Observações
          </div>
          <div className="whitespace-pre-wrap text-sm">{h.obs}</div>
        </div>
      )}

      <div className="rounded-md border bg-card">
        <div className="border-b p-3 text-sm font-semibold">
          Itens ({data.items.length})
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Consumível</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>CC</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Entregue</TableHead>
              <TableHead className="text-right">A entregar</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((it) => (
              <TableRow key={it.consumivel}>
                <TableCell className="font-mono text-xs">
                  {it.consumivel}
                </TableCell>
                <TableCell>{it.descConsumivel}</TableCell>
                <TableCell className="font-mono text-xs">
                  {it.rateioFilial ?? '—'}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {it.rateioCentroCusto ?? '—'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {it.qtdeOriginal} {it.unidade ?? ''}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {it.qtdeEntregue}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {it.qtdeEntregar > 0 ? (
                    <span className="text-amber-700">{it.qtdeEntregar}</span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(it.valorOriginal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border bg-card">
        <div className="border-b p-3 text-sm font-semibold">
          Notas Fiscais de entrada ({data.nfes.length})
        </div>
        {data.nfes.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            Nenhuma NF lançada para este pedido no Linx.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Emissão</TableHead>
                <TableHead>NF / Série</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Chave NFe</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.nfes.map((nfe) => (
                <TableRow key={`${nfe.nfEntrada}|${nfe.serieNf}|${nfe.nomeClifor}`}>
                  <TableCell>{formatDate(nfe.emissao)}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {nfe.nfEntrada}
                    {nfe.serieNf ? `/${nfe.serieNf}` : ''}
                  </TableCell>
                  <TableCell>{nfe.nomeClifor}</TableCell>
                  <TableCell className="break-all font-mono text-xs">
                    {nfe.chaveNfe ?? (
                      <span className="text-muted-foreground italic">
                        sem chave
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(nfe.valorTotal)}
                  </TableCell>
                  <TableCell className="text-right">
                    {nfe.fiscalDocumentId && (
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        title="Abrir detalhe da NF no P2P"
                      >
                        <Link
                          to={`/fiscal/notas-fiscais/${nfe.fiscalDocumentId}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                    {nfe.canDownloadXml && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Baixar XML (Qive)"
                        onClick={() => handleDownloadNfe(nfe, 'xml')}
                      >
                        <Download className="h-4 w-4" />
                        <span className="ml-1 text-xs">XML</span>
                      </Button>
                    )}
                    {nfe.canDownloadDanfe && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Baixar DANFe (PDF)"
                        onClick={() => handleDownloadNfe(nfe, 'danfe')}
                      >
                        <Download className="h-4 w-4" />
                        <span className="ml-1 text-xs">PDF</span>
                      </Button>
                    )}
                    {!nfe.canDownloadDanfe && !nfe.canDownloadXml && (
                      <span className="text-xs text-muted-foreground">
                        sem download
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{value || '—'}</div>
    </div>
  );
}
