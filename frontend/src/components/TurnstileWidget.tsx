import { useEffect, useRef } from 'react';

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
 * Modo `invisible` por padrão — só mostra desafio quando a Cloudflare
 * desconfia do tráfego (IP suspeito, ausência de fingerprint, etc.).
 */

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
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  useEffect(() => {
    // Sem site key configurado = dev/demo. Libera o login imediatamente.
    if (!siteKey) {
      onVerify('');
      return;
    }
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          size: 'normal',
          callback: (token: string) => onVerify(token),
          'error-callback': () => onVerify(''),
          'expired-callback': () => onVerify(''),
        });
      })
      .catch(() => onVerify(''));
    return () => {
      cancelled = true;
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
  return <div ref={containerRef} className="cf-turnstile" />;
}
