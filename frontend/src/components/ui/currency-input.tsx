import { Input } from './input';
import { formatCurrency } from '@/lib/format';

interface CurrencyInputProps {
  /** Valor em reais. `null`/`undefined` aceitos quando `nullable` é true. */
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  /** Quando true, campo vazio devolve `null` em vez de `0`. */
  nullable?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Campo de valor em Real. Exibe formatado (R$ 1.234,56); o usuário digita
 * apenas os dígitos e o valor é montado da direita para a esquerda.
 *
 * Com `nullable`, o campo aceita ficar vazio e devolve `null` — útil
 * para "sem limite" em campos opcionais (ex.: alçada máxima).
 */
export function CurrencyInput({
  value,
  onChange,
  nullable,
  placeholder,
  id,
  className,
  disabled,
}: CurrencyInputProps) {
  const display =
    value == null
      ? ''
      : formatCurrency(value);
  return (
    <Input
      id={id}
      className={className}
      disabled={disabled}
      inputMode="numeric"
      placeholder={placeholder}
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        if (!digits) {
          onChange(nullable ? null : 0);
        } else {
          onChange(Number(digits) / 100);
        }
      }}
    />
  );
}
