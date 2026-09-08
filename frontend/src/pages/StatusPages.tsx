import { Link } from 'react-router-dom';
import { ShieldAlert, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Telas de estado (sem acesso / não encontrado) — substituem o antigo
 * "cair na home sem aviso". Deixam claro o que aconteceu e dão o caminho
 * de volta, em vez de o usuário achar que o app bugou.
 */
function StatusShell({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}

/** 403 — usuário autenticado, mas sem permissão para esta tela. */
export function AccessDeniedPage() {
  return (
    <StatusShell
      icon={<ShieldAlert className="size-6" />}
      title="Sem acesso a esta tela"
      message="Seu perfil não tem permissão para abrir esta página. Se você
        precisa desse acesso, fale com o administrador."
    />
  );
}

/** 404 — rota inexistente. */
export function NotFoundPage() {
  return (
    <StatusShell
      icon={<Compass className="size-6" />}
      title="Página não encontrada"
      message="O endereço que você tentou abrir não existe ou foi movido."
    />
  );
}
