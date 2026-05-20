import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/use-toast';

/** Guarda de rotas: bloqueia acesso sem usuário autenticado. */
export function RequireAuth() {
  const { user, loading, sessionExpired, acknowledgeSessionExpired } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Quando o interceptor de 401 marca a sessão como expirada, navegamos
  // para /login preservando o destino — sem reload, sem perda de estado.
  useEffect(() => {
    if (sessionExpired) {
      toast({
        title: 'Sessão expirada',
        description: 'Faça login novamente para continuar.',
        variant: 'destructive',
      });
      acknowledgeSessionExpired();
      navigate('/login', { replace: true, state: { from: location.pathname } });
    }
  }, [sessionExpired, navigate, location.pathname, acknowledgeSessionExpired, toast]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
