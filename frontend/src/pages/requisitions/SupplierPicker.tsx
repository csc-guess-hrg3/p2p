import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, X } from 'lucide-react';
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

/**
 * Seletor de fornecedor com 2 modos:
 *
 *  - **Do ERP**: busca por nome/CNPJ no `v_p2p_suppliers` (combobox tradicional).
 *  - **Por CNPJ** (externo): digita o CNPJ, sistema busca no ERP e cai na
 *    BrasilAPI se não achar. Razão social vem preenchida automaticamente.
 *    Quando a requisição for aprovada, o fornecedor é cadastrado no Linx.
 *
 * O estado externo é o `SupplierPickerValue` — o form pai persiste só isso.
 */
export function SupplierPicker({ company, value, onChange }: Props) {
  const [mode, setMode] = useState<'erp' | 'external'>(
    value.isExternal ? 'external' : 'erp',
  );

  // Estado interno do modo externo
  const [cnpj, setCnpj] = useState(
    value.isExternal ? maskCnpj(value.supplierCnpj) : '',
  );
  const [supplierName, setSupplierName] = useState(
    value.isExternal ? value.supplierName : '',
  );
  const [erpMatch, setErpMatch] = useState<ErpSupplier | null>(null);
  const [publicMatch, setPublicMatch] = useState<PublicCnpjData | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Lookup cascata (ERP → BrasilAPI) quando o CNPJ é digitado.
  useEffect(() => {
    if (mode !== 'external' || !company) return;
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length < 11) {
      setErpMatch(null);
      setPublicMatch(null);
      setLookingUp(false);
      return;
    }
    let cancelled = false;
    setLookingUp(true);
    const timer = setTimeout(async () => {
      const erp = await lookupSupplierByCnpj(company, digits);
      if (cancelled) return;
      if (erp) {
        // Achou no ERP — propaga e sai do modo externo.
        setErpMatch(erp);
        setPublicMatch(null);
        setLookingUp(false);
        // Sugere usar o ERP em vez de cadastrar externo (mostramos banner).
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
  }, [cnpj, mode, company]);

  // Quando o usuário digita o nome manualmente (último fallback).
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

  /**
   * Reseta a seleção pra estado vazio. `isExternal` é deixado `false`
   * (default semântico) — o pai decide pelo modo atual da UI, não pelo
   * estado anterior. Usado tanto pelo X manual quanto pela troca de modo.
   */
  function clearSelection() {
    setCnpj('');
    setSupplierName('');
    setErpMatch(null);
    setPublicMatch(null);
    setLookingUp(false);
    onChange({
      supplierErpCode: '',
      supplierCnpj: '',
      supplierName: '',
      isExternal: false,
      suggestedPaymentCondition: null,
    });
  }

  const cnpjDigits = cnpj.replace(/\D/g, '');
  const cnpjValid = cnpjDigits.length === 14 || cnpjDigits.length === 11;
  const autoIdentified = !!erpMatch || !!publicMatch;
  const needsName = mode === 'external' && cnpjValid && !lookingUp && !autoIdentified && !supplierName.trim();

  return (
    <div className="space-y-2">
      {/* Busca em destaque — fornecedor já cadastrado no ERP. */}
      {mode === 'erp' && (
        <div className="space-y-2">
          <SupplierCombobox
            company={company}
            value={value.isExternal ? '' : value.supplierErpCode}
            selectedName={value.isExternal ? '' : value.supplierName}
            onChange={(codigo, supplier) =>
              onChange({
                supplierErpCode: codigo,
                supplierCnpj: (supplier.cnpjCpf ?? '').replace(/\D/g, ''),
                supplierName: supplier.nome,
                isExternal: false,
                suggestedPaymentCondition: supplier.condicaoPgto ?? null,
              })
            }
            onClear={clearSelection}
          />
          {/* Caminho secundário: não está cadastrado → vai pra aprovação. */}
          <button
            type="button"
            onClick={() => {
              setMode('external');
              clearSelection();
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" />
            Não encontrou? Cadastrar novo fornecedor (vai para aprovação)
          </button>
        </div>
      )}

      {mode === 'external' && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          {/* Cabeçalho do modo "novo" + voltar à busca. */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Plus className="size-4 text-primary" />
              Novo fornecedor
            </span>
            <button
              type="button"
              onClick={() => {
                setMode('erp');
                clearSelection();
              }}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              ← buscar um já cadastrado
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Informe o CNPJ. O fornecedor segue junto da requisição{' '}
            <b>para validação</b> — quando aprovada, ele é cadastrado no Linx
            automaticamente. Não cadastramos direto sem aprovação.
          </p>

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
                    onClick={clearSelection}
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
                disabled={autoIdentified}
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

          {cnpjValid && !erpMatch && publicMatch && (
            <div className="flex items-start gap-2 rounded-md border border-info/40 bg-info/5 p-2 text-xs">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-info" />
              <div className="flex-1 text-foreground">
                <p className="font-medium text-info">
                  Fornecedor externo — dados da Receita Federal
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
                  Será cadastrado automaticamente no Linx quando a
                  requisição for aprovada.
                </p>
              </div>
            </div>
          )}

          {cnpjValid && !lookingUp && !erpMatch && !publicMatch && (
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
