import { useState } from 'react';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { Card, CardContent } from '@/components/ui/card';
import { type Attachment } from '@/lib/attachments';
import { useQuotations } from '@/lib/quotations';
import { QuotationDialog } from './QuotationDialog';
import { QuotationsCard } from './QuotationsCard';
import type { Requisition } from '@/lib/requisitions';

interface Props {
  requisition: Requisition;
}

/**
 * Bloco que reúne anexos + cotações no próprio formulário da requisição
 * (modo edição). Antes, o usuário precisava salvar e ir pra tela de
 * detalhe para anexar cotações — fricção desnecessária. Agora tudo
 * acontece no mesmo lugar enquanto a requisição está aberta a alterações.
 */
export function InlineQuotationsAndAttachments({ requisition }: Props) {
  const [quotationAttachment, setQuotationAttachment] =
    useState<Attachment | null>(null);
  const { data: quotations = [] } = useQuotations(requisition.id);
  const editable =
    requisition.status === 'DRAFT' || requisition.status === 'REVISION';

  if (!editable) return null;

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <AttachmentsSection
            kind="requisition"
            parentId={requisition.id}
            hint="Cotações, contratos e documentos de apoio. Ao enviar um arquivo do tipo Cotação, o cadastro da proposta abre em seguida."
            allowedDocKinds={['QUOTATION', 'CONTRACT', 'INVOICE', 'OTHER']}
            // Sem defaultDocKind → usuário escolhe tipo conscientemente.
            onQuotationUploaded={(att) => setQuotationAttachment(att)}
          />
        </CardContent>
      </Card>

      {quotations.length > 0 && (
        <QuotationsCard
          requisitionId={requisition.id}
          quotations={quotations}
          canSelect={false}
          canEdit
          requisitionForEdit={requisition}
        />
      )}

      {quotationAttachment && (
        <QuotationDialog
          requisition={requisition}
          attachmentId={quotationAttachment.id}
          open={!!quotationAttachment}
          onOpenChange={(o) => !o && setQuotationAttachment(null)}
        />
      )}

    </>
  );
}
