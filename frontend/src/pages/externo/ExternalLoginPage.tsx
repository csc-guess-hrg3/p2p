import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { extractApiMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TurnstileWidget, TURNSTILE_ENABLED } from '@/components/TurnstileWidget';

/**
 * Login do portal externo — usuário = CÓDIGO do representante + senha.
 * Reusa o /auth/login-local (mesmo mecanismo dos usuários locais). No 1º
 * acesso o rep define a senha pelo link recebido por e-mail (/definir-senha).
 *
 * Anti-bot: envia o token do Turnstile ao login-local, igual à LoginPage
 * interna. Sem a chave (VITE_TURNSTILE_SITE_KEY) o widget não renderiza e
 * emite token vazio, que o backend aceita — funciona com ou sem Turnstile.
 */
export function ExternalLoginPage() {
  const { user, loginLocal } = useAuth();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Já logado: externo vai pro portal, interno volta pro app.
  if (user) {
    return <Navigate to={user.realm === 'EXTERNAL' ? '/externo' : '/'} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return; // guarda de duplo-submit
    setErro(null);
    setEnviando(true);
    try {
      await loginLocal(codigo.trim(), senha, turnstileToken);
      navigate('/externo', { replace: true });
    } catch (err) {
      setErro(extractApiMessage(err, 'Não foi possível entrar.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="text-xl font-semibold tracking-tight">GUESS</div>
          <CardTitle className="text-base font-medium text-muted-foreground">
            Portal do Representante
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="codigo">Código do representante</Label>
              <Input
                id="codigo"
                autoFocus
                autoComplete="username"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="ex.: 007713"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <TurnstileWidget onVerify={setTurnstileToken} />
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={
                enviando ||
                !codigo ||
                !senha ||
                (TURNSTILE_ENABLED && !turnstileToken)
              }
            >
              {enviando
                ? 'Entrando…'
                : TURNSTILE_ENABLED && !turnstileToken
                  ? 'Verificando…'
                  : 'Entrar'}
            </Button>
            <button
              type="button"
              onClick={() => navigate('/recuperar-acesso')}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Primeiro acesso ou esqueci minha senha
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
