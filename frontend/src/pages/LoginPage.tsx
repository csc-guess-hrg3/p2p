import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Sparkles, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getEnvironment, setEnvironment } from '@/lib/api';
import { DEMO_USERS, PROFILE_LABELS } from '@/lib/demo/catalog';
import { resetDemoState } from '@/lib/demo/state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

/**
 * Reconhece o formato do identificador para decidir entre login AD e
 * login local. Convenções:
 *  - 11 dígitos → CPF (login local)
 *  - contém @  → e-mail (login local)
 *  - resto     → usuário de rede (AD)
 */
function detectLoginType(identifier: string): 'AD' | 'LOCAL' {
  const v = identifier.trim();
  if (v.includes('@')) return 'LOCAL';
  if (/^\d{11}$/.test(v.replace(/\D/g, ''))) return 'LOCAL';
  return 'AD';
}

export function LoginPage() {
  const { user, loading, login, loginLocal, loginDemo } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoSubmitting, setDemoSubmitting] = useState<string | null>(null);

  // Tela de login sempre opera em PROD — limpa leftover de HML de sessão
  // anterior. Mantém a empresa ativa zerada também, pra re-selecionar
  // pelo /auth/me.
  useEffect(() => {
    if (getEnvironment() !== 'PROD') {
      setEnvironment('PROD');
      localStorage.removeItem('p2p_company');
    }
  }, []);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const type = detectLoginType(identifier);
      if (type === 'LOCAL') {
        // CPF: normaliza para só dígitos antes de enviar.
        const id = identifier.includes('@')
          ? identifier.trim().toLowerCase()
          : identifier.replace(/\D/g, '');
        await loginLocal(id, password);
      } else {
        await login(identifier.trim(), password);
      }
      navigate('/', { replace: true });
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) {
        setError('Usuário ou senha inválidos.');
      } else {
        setError('Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoLogin(demoUsername: string) {
    setError(null);
    setDemoSubmitting(demoUsername);
    try {
      await loginDemo(demoUsername);
      navigate('/', { replace: true });
    } catch (err) {
      const detail =
        (isAxiosError(err) && err.response?.data?.message) ||
        'Não foi possível entrar no modo demo.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setDemoSubmitting(null);
    }
  }

  function handleResetDemo() {
    resetDemoState();
    toast({
      title: 'Dados demo resetados',
      description: 'O estado simulado voltou ao seed inicial.',
      variant: 'success',
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="flex items-center gap-1">
            <span className="text-3xl font-extrabold tracking-tight text-foreground">
              HRG
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-2xl font-extrabold text-white">
              3
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Procure-to-Pay</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Usuário</Label>
              <Input
                id="identifier"
                autoFocus
                autoComplete="username"
                placeholder="usuário, e-mail ou CPF"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Usuários de rede (AD) entram com o login corporativo;
                supervisores entram com o e-mail; vendedores entram com CPF.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link
                  to="/definir-senha"
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  Tem um link de definição?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          {/* Modo Demonstração — 100% local, não depende do backend. */}
          <div className="mt-6 border-t pt-4">
            <button
              type="button"
              onClick={() => setShowDemo((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-medium text-primary hover:underline"
            >
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-4" />
                Modo demonstração
              </span>
              <span className="text-muted-foreground">
                {showDemo ? '−' : '+'}
              </span>
            </button>

            {showDemo && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Login simulado sem banco de dados. Os fluxos rodam em
                  memória (localStorage) com a empresa{' '}
                  <strong>DEMO</strong>, equipe, fornecedores, itens e duas
                  requisições de exemplo (uma em rascunho, outra aguardando
                  aprovação do gestor).
                </p>
                <div className="space-y-2">
                  {DEMO_USERS.map((u) => (
                    <button
                      type="button"
                      key={u.username}
                      onClick={() => handleDemoLogin(u.username)}
                      disabled={demoSubmitting !== null}
                      className="w-full rounded-md border border-input bg-background p-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{u.name}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {PROFILE_LABELS[u.profile] ?? u.profile}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {u.description}
                      </p>
                      <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                        {u.username}
                        {demoSubmitting === u.username && ' — entrando…'}
                      </p>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleResetDemo}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3" />
                  Resetar dados demo
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
