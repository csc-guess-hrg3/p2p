import { Link } from 'react-router-dom';
import { Download, FileText, ExternalLink } from 'lucide-react';
import {
  useFiscalDocumentsByPo,
  downloadFiscalXml,
  downloadFiscalDanfe,
  statusLabel,
} from '@/lib/fiscal-documents';
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
import { StatusBadge } from '@/components/StatusBadge';

/**
 * Card exibido no detalhe do Pedido de Compra mostrando as NFes
 * vinculadas (XML/PDF disponíveis para download).
 *
 * O vínculo é feito do lado da NF (tela Fiscal > Notas Fiscais).
 * Aqui é só visualização + download.
 */
export function PoFiscalDocumentsCard({
  purchaseOrderId,
}: {
  purchaseOrderId: string;
}) {
  const { data, isLoading } = useFiscalDocumentsByPo(purchaseOrderId);
  const { toast } = useToast();

  async function handleDownload(
    doc: { id: string; accessKey: string },
    kind: 'xml' | 'danfe',
  ) {
    try {
      if (kind === 'xml') await downloadFiscalXml(doc);
      else await downloadFiscalDanfe(doc);
    } catch (err) {
      toast({
        title: 'Falha no download',
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
          Notas Fiscais vinculadas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : !data?.length ? (
          <div className="text-sm text-muted-foreground">
            Nenhuma NF vinculada a este PC ainda. Vincule pela tela{' '}
            <Link
              to="/fiscal/notas-fiscais"
              className="text-primary hover:underline"
            >
              Fiscal &gt; Notas Fiscais
            </Link>
            .
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Emissão</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((nf) => (
                <TableRow key={nf.id}>
                  <TableCell>{formatDate(nf.emissao)}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {nf.numero}
                    {nf.serie ? `/${nf.serie}` : ''}
                  </TableCell>
                  <TableCell>{nf.supplierName}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(nf.valorTotal)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={statusLabel(nf.status)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      title="Abrir detalhe"
                    >
                      <Link to={`/fiscal/notas-fiscais/${nf.id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Baixar XML"
                      onClick={() =>
                        handleDownload(
                          { id: nf.id, accessKey: nf.accessKey },
                          'xml',
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                      <span className="ml-1 text-xs">XML</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Baixar DANFe"
                      onClick={() =>
                        handleDownload(
                          { id: nf.id, accessKey: nf.accessKey },
                          'danfe',
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                      <span className="ml-1 text-xs">PDF</span>
                    </Button>
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
