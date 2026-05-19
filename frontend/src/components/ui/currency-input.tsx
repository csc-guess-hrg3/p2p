import { Input } from './input';
import { formatCurrency } from '@/lib/format';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Campo de valor em Real. Exibe formatado (R$ 1.234,56); o usuário digita
 * apenas os dígitos e o valor é montado da direita para a esquerda.
 */
export function CurrencyInput({
  value,
  onChange,
  id,
  className,
  disabled,
}: CurrencyInputProps) {
  return (
    <Input
      id={id}
      className={className}
      disabled={disabled}
      inputMode="numeric"
      value={formatCurrency(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        onChange(digits ? Number(digits) / 100 : 0);
      }}
    />
  );
}
