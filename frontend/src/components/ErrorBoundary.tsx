import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * ErrorBoundary global. Captura erros de renderização para que a app não
 * exiba uma página em branco em produção. Os erros são logados no console
 * (e ficam visíveis em DevTools); quando subir uma camada de APM, plugar
 * aqui.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
          <h2 className="text-lg font-semibold">Algo deu errado.</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Encontramos um erro inesperado ao carregar esta tela. Você pode
            tentar novamente; se o problema persistir, avise o time de TI.
          </p>
          <pre className="max-w-xl whitespace-pre-wrap rounded bg-muted p-3 text-left text-xs">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
