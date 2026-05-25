import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Checkbox padrão do app — wrapper sobre Radix com suporte nativo a
 * `indeterminate` (estado `'indeterminate'` passado como `checked`).
 *
 * Uso típico:
 *   <Checkbox checked={selected} onCheckedChange={setSelected} />
 *   <Checkbox checked={allChecked ? true : someChecked ? 'indeterminate' : false} />
 *
 * Padrões visuais:
 *  - 16px (`size-4`) — adequado a tabelas e listas densas
 *  - borda 1px primária; quando marcado, preenche e mostra ícone branco
 *  - foco visível pra acessibilidade
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-primary shadow-sm transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      {props.checked === 'indeterminate' ? (
        <Minus className="size-3" />
      ) : (
        <Check className="size-3" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
