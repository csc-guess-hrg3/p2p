import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { TooltipProvider } from '@/components/ui/tooltip';
import './index.css';
import App from './App.tsx';

// Deploy novo troca os nomes dos chunks (hash no filename). Uma aba aberta
// desde ANTES do deploy tenta baixar o chunk ANTIGO ao navegar (lazy import) e
// falha ("Failed to fetch dynamically imported module"). Aqui recarregamos a
// página UMA vez (guarda de 10s contra loop) pra pegar o index/chunks novos —
// o usuário nem vê o erro, em vez da tela "Algo deu errado".
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('chunkReloadAt') || '0');
    if (Date.now() - last <= 10_000) return; // já recarregou há pouco — evita loop
    sessionStorage.setItem('chunkReloadAt', String(Date.now()));
  } catch {
    /* sessionStorage indisponível — recarrega mesmo assim */
  }
  window.location.reload();
});

const ReactQueryDevtools = import.meta.env.DEV
  ? (await import('@tanstack/react-query-devtools')).ReactQueryDevtools
  : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <App />
      </TooltipProvider>
      {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  </StrictMode>,
);
