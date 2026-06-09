import { AttachmentsSection } from '@/components/AttachmentsSection';
import { Card, CardContent } from '@/components/ui/card';
import { useQuotations } from '@/lib/quotations';
import { QuotationsCard } from './QuotationsCard';
import type { Requisition } from '@/lib/requisitions';

interface Props {
  requisition: Requisition;
}

/**
 * Bloco que reúne cotações + anexos no próprio formulário da requisição
 * (modo edição). Antes, o usuário precisava salvar e ir pra tela de
 * detalhe para anexar cotações — fricção desnecessária. Agora tudo
 * acontece no mesmo lugar enquanto a requisição está aberta a alterações.
 *
 * Cotação tem fluxo PRÓPRIO (botão "Adicionar cotação" no card) — o
 * formulário herda os itens da requisição e exige o PDF da proposta.
 * Os anexos abaixo são só documentos de apoio (contrato/fatura/outros).
 */
export function InlineQuotationsAndAttachments({ requisition }: Props) {
  const { data: quotations = [] } = useQuotations(requisition.id);
  const editable =
    requisition.status === 'DRAFT' || requisition.status === 'REVISION';

  if (!editable) return null;

  return (
    <>
      <QuotationsCard
        requisitionId={requisition.id}
        quotations={quotations}
        canSelect={false}
        canEdit
        requisitionForEdit={requisition}
        hideAddButton
      />

      <Card>
        <CardContent className="pt-6">
          <AttachmentsSection
            kind="requisition"
            parentId={requisition.id}
            hint="Contratos, faturas e documentos de apoio. O PDF da cotação é anexado no próprio cadastro da cotação, acima."
            allowedDocKinds={['CONTRACT', 'INVOICE', 'OTHER']}
            hideLinkedQuotations
          />
        </CardContent>
      </Card>
    </>
  );
}
