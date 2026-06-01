import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CloudDownload, Download, ExternalLink, FileText } from 'lucide-react';
import { usePaOrderNfes, type PaOrderNfeRow } from '@/lib/product-orders-pa';
import {
  downloadFiscalXml,
  downloadFiscalDanfe,
  useFetchFiscalByChave,
} from '@/lib/fiscal-documents';
import { downloadLegacyDanfe } from '@/lib/legacy-orders';
import { useCompany } from '@/lib/company';
import { formatCurrency, formatDate } from '@/lib/format';
import { useToast } from '@/components/ui/use-toast';
import { extractApiMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Card de Notas Fiscais do pedido PA — exibido na tela de detalhe.
 * Mostra as NFs lançadas no Linx pra esse pedido (ENTRADAS_PRODUTO →
 * ENTRADAS) com botões de download de XML/DANFe.
 *
 * Estados por NF:
 *  - Tem chave NFe + tem FiscalDocument no P2P → XML + PDF disponíveis
 *  - Tem chave NFe + sem FiscalDocument → só PDF (read-through Qive) e
 *    botão "Buscar na Qive" pra trazer o XML e persistir
 *  - Sem chave NFe → só dados básicos
 */
export function PaFiscalDocumentsCard({
  company,
  pedido,
}: {
  company: string;
  pedido: string;
}) {
  const { data, isLoading } = usePaOrderNfes(company, pedido);
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fetchByChave = useFetchFiscalByChave();

  async function handleDownload(nfe: PaOrderNfeRow, kind: 'xml' | 'danfe') {
    try {
      if (kind === 'xml') {
        if (!nfe.fiscalDocumentId)
          throw new Error('XML não disponível (NF ainda não baixada da Qive)');
        await downloadFiscalXml({
          id: nfe.fiscalDocumentId,
          accessKey: nfe.chaveNfe ?? '',
        });
      } else if (nfe.fiscalDocumentId) {
        await downloadFiscalDanfe({
          id: nfe.fiscalDocumentId,
          accessKey: nfe.chaveNfe ?? '',
        });
      } else if (nfe.chaveNfe) {
        await downloadLegacyDanfe(nfe.chaveNfe);
      } else {
        throw new Error('NF sem chave de acesso');
      }
    } catch (err) {
      toast({
        title: 'Falha no download',
        description: extractApiMessage(err) || String((err as Error).message),
        variant: 'destructive',
      });
    }
  }

  async function handleFetchFromQive(chave: string) {
    try {
      const res = await fetchByChave.mutateAsync({
        chave,
        legacyPedido: pedido,
        legacyCompanyId: activeCompany?.id,
      });
      toast({
        title: res.created ? 'NF baixada da Qive' : 'NF já estava no P2P',
        description: 'XML e DANFe agora disponíveis.',
      });
      qc.invalidateQueries({
        queryKey: ['pa-order-nfes', company, pedido],
      });
    } catch (err) {
      toast({
        title: 'Falha ao buscar NF na Qive',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Notas Fiscais ({data?.length ?? 0})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : !data?.length ? (
          <div className="text-sm text-muted-foreground">
            Nenhuma NF lançada no Linx para este pedido.
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
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((nfe) => (
                <TableRow
                  key={`${nfe.nfEntrada}|${nfe.serieNf}|${nfe.nomeClifor}`}
                >
                  <TableCell>{formatDate(nfe.emissao)}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {nfe.nfEntrada}
                    {nfe.serieNf ? `/${nfe.serieNf}` : ''}
                  </TableCell>
                  <TableCell>{nfe.nomeClifor}</TableCell>
                  <TableCell className="break-all font-mono text-xs">
                    {nfe.chaveNfe ?? (
                      <span className="italic text-muted-foreground">
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
                        title="Abrir no módulo Notas Fiscais"
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
                        title="Baixar XML"
                        onClick={() => handleDownload(nfe, 'xml')}
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
                        onClick={() => handleDownload(nfe, 'danfe')}
                      >
                        <Download className="h-4 w-4" />
                        <span className="ml-1 text-xs">PDF</span>
                      </Button>
                    )}
                    {!nfe.fiscalDocumentId && nfe.chaveNfe && (
                      <Button
                        variant="outline"
                        size="sm"
                        title="Trazer essa NF da Qive (libera XML)"
                        onClick={() => handleFetchFromQive(nfe.chaveNfe!)}
                        disabled={fetchByChave.isPending}
                      >
                        <CloudDownload className="mr-1 h-4 w-4" />
                        <span className="text-xs">Buscar na Qive</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
