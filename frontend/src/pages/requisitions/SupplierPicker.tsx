import { useEffect, useState } from 'react';
import { AlertCircle, Ban, CheckCircle2, Search, X } from 'lucide-react';
import {
  lookupSupplierByCnpj,
  lookupCnpjPublic,
  maskCnpj,
  type PublicCnpjData,
} from '@/lib/quotations';
import type { ErpSupplier } from '@/lib/integration';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SupplierCombobox } from './SupplierCombobox';

export interface SupplierPickerValue {
  /** Cadastrado: ERP code preenchido. Externo: vazio. */
  supplierErpCode: string;
  /** CNPJ — sempre presente (do ERP ou digitado). */
  supplierCnpj: string;
  /** Razão social — vem do ERP, da BrasilAPI ou digitada. */
  supplierName: string;
  /** True quando o fornecedor não está no ERP (vai ser criado ao aprovar). */
  isExternal: boolean;
  /** Condição de pagamento sugerida (auto pelo ERP/Receita). */
  suggestedPaymentCondition?: string | null;
}

interface Props {
  company?: string;
  value: SupplierPickerValue;
  onChange: (next: SupplierPickerValue) => void;
}

const EMPTY: SupplierPickerValue = {
  supplierErpCode: '',
  supplierCnpj: '',
  supplierName: '',
  isExternal: false,
  suggestedPaymentCondition: null,
};

/**
 * Seletor de fornecedor — fluxo ÚNICO e progressivo (sem abas):
 *
 *  1. Busca por NOME (ou CNPJ) no cadastro do ERP (combobox). Fornecedor
 *     INATIVO aparece marcado e BLOQUEADO (reative no Linx antes de usar).
 *  2. Não achou pelo nome → "Buscar por CNPJ": digita o CNPJ e o sistema
 *     resolve em cascata:
 *       - achou no ERP e ativo   → usa o cadastrado;
 *       - achou no ERP e inativo → BLOQUEIA e orienta a reativar no Linx;
 *       - não está no ERP, mas a Receita conhece → "será encaminhado para
 *         cadastro" (cadastrado no Linx quando a requisição for aprovada);
 *       - não achou em lugar nenhum → confira o CNPJ.
 */
export function SupplierPicker({ company, value, onChange }: Props) {
  // Abre o bloco de CNPJ automaticamente se a seleção atual já é externa.
  const [showCnpj, setShowCnpj] = useState(value.isExternal);
  const [cnpj, setCnpj] = useState(
    value.isExternal ? maskCnpj(value.supplierCnpj) : '',
  );
  const [supplierName, setSupplierName] = useState(
    value.isExternal ? value.supplierName : '',
  );
  const [erpMatch, setErpMatch] = useState<ErpSupplier | null>(null);
  /** Achou no ERP mas está INATIVO — bloqueia o uso. */
  const [inactiveMatch, setInactiveMatch] = useState<ErpSupplier | null>(null);
  const [publicMatch, setPublicMatch] = useState<PublicCnpjData | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Lookup cascata (ERP → BrasilAPI) quando o CNPJ é digitado.
  useEffect(() => {
    if (!showCnpj || !company) return;
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length < 11) {
      setErpMatch(null);
      setInactiveMatch(null);
      setPublicMatch(null);
      setLookingUp(false);
      return;
    }
    let cancelled = false;
    setLookingUp(true);
    const timer = setTimeout(async () => {
      const erp = await lookupSupplierByCnpj(company, digits);
      if (cancelled) return;
      if (erp && erp.inativo) {
        // Existe no ERP mas INATIVO → bloqueia. Não seleciona nada (o form
        // fica sem fornecedor válido); orienta a reativar no Linx.
        setInactiveMatch(erp);
        setErpMatch(null);
        setPublicMatch(null);
        setLookingUp(false);
        onChange({ ...EMPTY, supplierCnpj: digits });
        return;
      }
      if (erp) {
        // Achou no ERP e ativo — usa o cadastrado.
        setErpMatch(erp);
        setInactiveMatch(null);
        setPublicMatch(null);
        setLookingUp(false);
        onChange({
          supplierErpCode: erp.codigo,
          supplierCnpj: digits,
          supplierName: erp.nome,
          isExternal: false,
          suggestedPaymentCondition: erp.condicaoPgto ?? null,
        });
        return;
      }
      setErpMatch(null);
      setInactiveMatch(null);
      if (digits.length === 14) {
        const pub = await lookupCnpjPublic(company, digits);
        if (cancelled) return;
        setPublicMatch(pub);
        if (pub) {
          setSupplierName(pub.razaoSocial);
          onChange({
            supplierErpCode: '',
            supplierCnpj: digits,
            supplierName: pub.razaoSocial,
            isExternal: true,
            suggestedPaymentCondition: null,
          });
        }
      } else {
        setPublicMatch(null);
      }
      setLookingUp(false);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj, showCnpj, company]);

  /** Nome digitado manualmente (último fallback, quando a Receita não achou). */
  function handleNameChange(name: string) {
    setSupplierName(name);
    const digits = cnpj.replace(/\D/g, '');
    onChange({
      supplierErpCode: '',
      supplierCnpj: digits,
      supplierName: name,
      isExternal: true,
      suggestedPaymentCondition: null,
    });
  }

  /** Zera tudo (seleção do ERP e caminho por CNPJ). */
  function clearAll() {
    setShowCnpj(false);
    setCnpj('');
    setSupplierName('');
    setErpMatch(null);
    setInactiveMatch(null);
    setPublicMatch(null);
    setLookingUp(false);
    onChange({ ...EMPTY });
  }

  function clearCnpj() {
    setCnpj('');
    setSupplierName('');
    setErpMatch(null);
    setInactiveMatch(null);
    setPublicMatch(null);
    setLookingUp(false);
    onChange({ ...EMPTY });
  }

  const cnpjDigits = cnpj.replace(/\D/g, '');
  const cnpjValid = cnpjDigits.length === 14 || cnpjDigits.length === 11;
  const autoIdentified = !!erpMatch || !!publicMatch;
  const needsName =
    cnpjValid &&
    !lookingUp &&
    !autoIdentified &&
    !inactiveMatch &&
    !supplierName.trim();

  return (
    <div className="space-y-2">
      {/* 1) Busca por nome/CNPJ no ERP */}
      <SupplierCombobox
        company={company}
        value={value.isExternal ? '' : value.supplierErpCode}
        selectedName={value.isExternal ? '' : value.supplierName}
        onChange={(codigo, supplier) => {
          // Escolheu pelo nome → some o caminho de CNPJ.
          setShowCnpj(false);
          setCnpj('');
          setErpMatch(null);
          setInactiveMatch(null);
          setPublicMatch(null);
          onChange({
            supplierErpCode: codigo,
            supplierCnpj: (supplier.cnpjCpf ?? '').replace(/\D/g, ''),
            supplierName: supplier.nome,
            isExternal: false,
            suggestedPaymentCondition: supplier.condicaoPgto ?? null,
          });
        }}
        onClear={clearAll}
      />

      {/* 2) Atalho pro caminho por CNPJ — só quando nada foi escolhido pelo
          nome. É o que a gente "recomenda" quando a busca por nome falha. */}
      {!value.supplierErpCode && !showCnpj && (
        <button
          type="button"
          onClick={() => setShowCnpj(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Search className="size-3.5" />
          Não encontrou pelo nome? Buscar por CNPJ
        </button>
      )}

      {showCnpj && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Buscar / cadastrar por CNPJ
            </Label>
            <button
              type="button"
              onClick={clearAll}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Fechar"
              aria-label="Fechar"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_1fr]">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">CNPJ</Label>
              <div className="relative">
                <Input
                  value={cnpj}
                  onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                  className={cnpj ? 'pr-8' : ''}
                />
                {cnpj && (
                  <button
                    type="button"
                    onClick={clearCnpj}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Limpar"
                    aria-label="Limpar"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Razão social
                {needsName && <span className="ml-1 text-destructive">*</span>}
              </Label>
              <Input
                value={supplierName}
                onChange={(e) => handleNameChange(e.target.value)}
                disabled={autoIdentified || !!inactiveMatch}
                placeholder={
                  autoIdentified
                    ? ''
                    : lookingUp
                      ? 'Consultando…'
                      : 'Nome do fornecedor'
                }
              />
            </div>
          </div>

          {/* Achou no ERP e ativo */}
          {cnpjValid && erpMatch && (
            <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/5 p-2 text-xs">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
              <div className="text-foreground">
                <p className="font-medium text-success">
                  Fornecedor já existe no ERP — vamos usar o cadastrado
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-mono">{erpMatch.codigo}</span> —{' '}
                  {erpMatch.nome}
                </p>
              </div>
            </div>
          )}

          {/* Achou no ERP mas INATIVO — bloqueado */}
          {cnpjValid && inactiveMatch && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
              <Ban className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <div className="text-foreground">
                <p className="font-medium text-destructive">
                  Fornecedor cadastrado, porém INATIVO — não pode ser usado
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-mono">{inactiveMatch.codigo}</span> —{' '}
                  {inactiveMatch.nome}. Reative o cadastro no Linx antes de
                  incluí-lo na requisição.
                </p>
              </div>
            </div>
          )}

          {/* Não está no ERP, mas a Receita conhece → encaminhar pra cadastro */}
          {cnpjValid && !erpMatch && !inactiveMatch && publicMatch && (
            <div className="flex items-start gap-2 rounded-md border border-info/40 bg-info/5 p-2 text-xs">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-info" />
              <div className="flex-1 text-foreground">
                <p className="font-medium text-info">
                  Fornecedor novo — dados da Receita Federal
                </p>
                {(publicMatch.logradouro || publicMatch.cidade) && (
                  <p className="text-[11px] text-muted-foreground">
                    {[
                      publicMatch.logradouro,
                      publicMatch.numero,
                      publicMatch.cidade && publicMatch.uf
                        ? `${publicMatch.cidade}/${publicMatch.uf}`
                        : publicMatch.cidade,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Será encaminhado para cadastro — a equipe fiscal cria no Linx
                  ao aprovar a requisição.
                </p>
              </div>
            </div>
          )}

          {/* Não achou em lugar nenhum */}
          {cnpjValid &&
            !lookingUp &&
            !erpMatch &&
            !inactiveMatch &&
            !publicMatch && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <div className="text-foreground">
                  <p className="font-medium text-warning">
                    CNPJ não encontrado no ERP nem na Receita Federal
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Confira o CNPJ ou informe o nome do fornecedor manualmente.
                  </p>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
