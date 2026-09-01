import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { FlaskConical, Server } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getEnvironment, setEnvironment, type AppEnv } from '@/lib/api';
import { extractApiMessage } from '@/lib/api-errors';
import { TurnstileWidget } from '@/components/TurnstileWidget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
/**
 * Tela de login corporativo: AD ou usuário local (supervisor). O backend
 * tenta AD primeiro; se falhar com 401, o front retenta como local. Não há
 * mais login por CPF (o fluxo de vendedor de loja foi removido).
 *
 * Ambiente (PROD/HML) é escolhido AQUI e fica travado durante a sessão.
 * Pra trocar, basta deslogar e escolher de novo no próximo login. Isso
 * mantém autenticações independentes por ambiente e elimina a categoria
 * de bug "JWT de um env mandado pro outro".
 */
export function LoginPage() {
  const { user, loading, login, loginLocal } = useAuth();
  const navigate = useNavigate();
  // Reflete o env do localStorage no controle. Default = PROD; admin/QA
  // pode trocar pra HML antes de logar (e a sessão fica em HML).
  const [env, setEnv] = useState<AppEnv>(() => getEnvironment());

  useEffect(() => {
    if (getEnvironment() !== env) {
      setEnvironment(env);
      localStorage.removeItem('p2p_company');
    }
  }, [env]);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="h-screen overflow-y-auto bg-muted/40">
      {/* h-screen + overflow-y-auto no wrapper: o scroll mora aqui (não
          no body — que está com overflow:hidden globalmente). O div
          interno usa `min-h-full` em vez de `h-screen`, então quando o
          card (modo demo expandido) é maior que a viewport, o container
          cresce e a página rola — em vez de cortar o topo do card. */}
      <div className="flex min-h-full items-center justify-center p-4">
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
          <StandardLoginForm
            onLogin={async (identifier, password, turnstileToken) => {
              // Backend AD tenta primeiro; se rejeitar com 401, caímos em
              // login-local com o mesmo identifier (username).
              try {
                await login(identifier, password, turnstileToken);
              } catch (err) {
                if (isAxiosError(err) && err.response?.status === 401) {
                  await loginLocal(identifier, password, turnstileToken);
                } else {
                  throw err;
                }
              }
              navigate('/', { replace: true });
            }}
          />

          <EnvironmentToggle value={env} onChange={setEnv} />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Login padrão (AD ou local supervisor)                              */
/* ------------------------------------------------------------------ */

function StandardLoginForm({
  onLogin,
}: {
  onLogin: (identifier: string, password: string, turnstileToken?: string) => Promise<void>;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(identifier.trim(), password, turnstileToken);
    } catch (err) {
      // 401 sempre vira a mesma frase neutra — não vaza qual dos dois
      // (usuário ou senha) está errado, padrão de segurança.
      if (isAxiosError(err) && err.response?.status === 401) {
        setError('Usuário ou senha inválidos.');
      } else {
        setError(extractApiMessage(err, 'Não foi possível entrar.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="identifier">Usuário</Label>
        <Input
          id="identifier"
          autoFocus
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
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
      <TurnstileWidget onVerify={setTurnstileToken} />
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Entrando…' : 'Entrar'}
      </Button>
      <Link
        to="/recuperar-acesso"
        className="block text-center text-xs text-muted-foreground hover:text-foreground"
      >
        Primeiro acesso ou esqueci minha senha
      </Link>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle de ambiente (PROD / HML)                                     */
/* ------------------------------------------------------------------ */

/**
 * Seletor discreto de ambiente. Fica "fechado" mostrando só o ambiente
 * atual; expande revelando as duas opções. Quem usa HML é minoria
 * (QA, admin), então o controle não compete com o login normal.
 */
function EnvironmentToggle({
  value,
  onChange,
}: {
  value: AppEnv;
  onChange: (v: AppEnv) => void;
}) {
  const [open, setOpen] = useState(value === 'HML');
  const isHml = value === 'HML';

  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          {isHml ? (
            <FlaskConical className="size-3.5 text-warning" />
          ) : (
            <Server className="size-3.5" />
          )}
          Ambiente:{' '}
          <span
            className={
              isHml ? 'font-semibold text-warning' : 'font-medium text-foreground'
            }
          >
            {isHml ? 'Homologação' : 'Produção'}
          </span>
        </span>
        <span>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div
          role="radiogroup"
          aria-label="Ambiente"
          className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!isHml}
            onClick={() => onChange('PROD')}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              !isHml
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Server className="size-3.5" />
            Produção
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isHml}
            onClick={() => onChange('HML')}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              isHml
                ? 'bg-warning/10 text-warning shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FlaskConical className="size-3.5" />
            Homologação
          </button>
        </div>
      )}
    </div>
  );
}

