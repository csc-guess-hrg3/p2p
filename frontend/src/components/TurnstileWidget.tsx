import { useEffect, useRef, useState } from 'react';

/**
 * Wrapper do widget Cloudflare Turnstile.
 *
 * - Renderiza o `<div>` que o script da Cloudflare popula.
 * - Carrega o script global apenas uma vez (idempotente).
 * - Se a env `VITE_TURNSTILE_SITE_KEY` não estiver definida, NÃO renderiza
 *   nada e chama `onVerify('')` imediatamente — assim o componente
 *   funciona em dev/intranet/demo sem a chave (e o backend também aceita
 *   token vazio quando `TURNSTILE_SECRET_KEY` não está setada).
 *
 * Modo `interaction-only` — o widget fica invisível e só mostra um desafio
 * quando a Cloudflare desconfia do tráfego. Em modo Gerenciado o token é
 * emitido em silêncio ~1-2s após carregar; por isso o formulário deve
 * ESPERAR o token (ver `TURNSTILE_ENABLED`) antes de habilitar o submit —
 * senão o usuário clica antes do token chegar e o backend recusa ("ausente").
 */

/**
 * `true` quando há site key configurada (build de produção). Os formulários
 * usam isto para travar o botão de envio até o token do Turnstile chegar.
 * Em dev (sem chave) é `false` e o envio é liberado direto.
 */
export const TURNSTILE_ENABLED = !!(
  import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
);

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          appearance?: 'always' | 'execute' | 'interaction-only';
          size?: 'normal' | 'compact' | 'invisible';
          theme?: 'light' | 'dark' | 'auto';
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

interface Props {
  onVerify: (token: string) => void;
}

let scriptLoaded = false;
function loadScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error('Falha ao carregar Turnstile.'));
    document.head.appendChild(s);
  });
}

export function TurnstileWidget({ onVerify }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const gotTokenRef = useRef(false);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  // Escape se a verificação travar: se o token não chegar em ~15s, mostramos
  // um aviso com "recarregar" em vez de deixar o botão travado em silêncio.
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    // Sem site key configurado = dev/demo. Libera o login imediatamente.
    if (!siteKey) {
      onVerify('');
      return;
    }
    let cancelled = false;
    // Em modo Gerenciado o token costuma chegar em 1-2s; 15s é folga p/ redes
    // lentas antes de sugerir recarregar.
    const stuckTimer = setTimeout(() => {
      if (!cancelled && !gotTokenRef.current) setStuck(true);
    }, 15000);
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          size: 'normal',
          callback: (token: string) => {
            gotTokenRef.current = true;
            setStuck(false);
            onVerify(token);
          },
          'error-callback': () => {
            gotTokenRef.current = false;
            onVerify('');
          },
          'expired-callback': () => {
            gotTokenRef.current = false;
            onVerify('');
          },
        });
      })
      .catch(() => {
        setStuck(true);
        onVerify('');
      });
    return () => {
      cancelled = true;
      clearTimeout(stuckTimer);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <div>
      <div ref={containerRef} className="cf-turnstile" />
      {stuck && (
        <p className="text-xs text-muted-foreground">
          A verificação de segurança demorou.{' '}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-medium text-primary hover:underline"
          >
            Recarregar a página
          </button>
          .
        </p>
      )}
    </div>
  );
}
