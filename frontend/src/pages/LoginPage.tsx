import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { RotateCcw, Sparkles, Store, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getEnvironment, setEnvironment } from '@/lib/api';
import { storeLookup, type StoreLookupResult } from '@/lib/store-auth';
import { DEMO_USERS, PROFILE_LABELS } from '@/lib/demo/catalog';
import { resetDemoState } from '@/lib/demo/state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

/**
 * Tela de login.
 *
 * Modos:
 *   - Padrão  → AD ou usuário local (supervisor). Backend tenta AD
 *               primeiro; se falhar com 401, o front retenta como local.
 *   - Loja    → CPF do vendedor; pré-flight valida em LOJA_VENDEDORES
 *               e direciona para 1º acesso (definir senha) ou login
 *               normal.
 *   - Demo    → Modo demonstração 100% local (localStorage).
 */
export function LoginPage() {
  const { user, loading, login, loginLocal, loginStore, loginDemo } =
    useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [storeMode, setStoreMode] = useState(false);

  // Sempre opera em PROD na tela de login.
  useEffect(() => {
    if (getEnvironment() !== 'PROD') {
      setEnvironment('PROD');
      localStorage.removeItem('p2p_company');
    }
  }, []);

  if (!loading && user) {
    return <Navigate to="/" replace />;
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
          {/* Segmented control entre os dois modos de login. Padrão
              segmented (estilo iOS/Tailwind): mais visível e óbvio que
              um checkbox solto. */}
          <div
            role="tablist"
            aria-label="Modo de login"
            className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!storeMode}
              onClick={() => setStoreMode(false)}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                !storeMode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <UserRound className="size-4" />
              Corporativo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={storeMode}
              onClick={() => setStoreMode(true)}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                storeMode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Store className="size-4" />
              Loja
            </button>
          </div>

          {storeMode ? (
            <StoreLoginForm
              onLogin={(cpf, pw, isSetup) =>
                loginStore(cpf, pw, { isSetup }).then(() =>
                  navigate('/', { replace: true }),
                )
              }
            />
          ) : (
            <StandardLoginForm
              onLogin={async (identifier, password) => {
                // Backend AD tenta primeiro; se rejeitar com 401, caímos
                // em login-local com o mesmo identifier (username).
                try {
                  await login(identifier, password);
                } catch (err) {
                  if (isAxiosError(err) && err.response?.status === 401) {
                    await loginLocal(identifier, password);
                  } else {
                    throw err;
                  }
                }
                navigate('/', { replace: true });
              }}
            />
          )}

          <DemoBlock
            onLogin={(u) =>
              loginDemo(u).then(() => navigate('/', { replace: true }))
            }
            onReset={handleResetDemo}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Login padrão (AD ou local supervisor)                              */
/* ------------------------------------------------------------------ */

function StandardLoginForm({
  onLogin,
}: {
  onLogin: (identifier: string, password: string) => Promise<void>;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(identifier.trim(), password);
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

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="identifier">Usuário</Label>
        <Input
          id="identifier"
          autoFocus
          autoComplete="username"
          placeholder="usuário de rede ou local"
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
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Login de vendedor da loja                                          */
/* ------------------------------------------------------------------ */

function maskCpf(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function StoreLoginForm({
  onLogin,
}: {
  onLogin: (cpf: string, password: string, isSetup: boolean) => Promise<void>;
}) {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [lookup, setLookup] = useState<StoreLookupResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckCpf() {
    setError(null);
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) {
      setError('Informe um CPF com 11 dígitos.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await storeLookup(digits);
      if (!result.found) {
        setError(
          'CPF não encontrado no cadastro de vendedores. Procure o RH.',
        );
        return;
      }
      setLookup(result);
    } catch {
      setError('Falha ao validar o CPF. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!lookup) {
      await handleCheckCpf();
      return;
    }
    setError(null);
    if (lookup.needsSetup) {
      if (password.length < 8) {
        setError('A senha precisa ter pelo menos 8 caracteres.');
        return;
      }
      if (password !== confirm) {
        setError('As senhas não conferem.');
        return;
      }
    }
    setSubmitting(true);
    try {
      await onLogin(cpf, password, lookup.needsSetup);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) {
        setError('Senha inválida.');
      } else if (isAxiosError(err) && err.response?.status === 400) {
        setError(
          (err.response.data as { message?: string })?.message ??
            'Não foi possível concluir.',
        );
      } else {
        setError('Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cpf">CPF</Label>
        <Input
          id="cpf"
          autoFocus
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => {
            setCpf(maskCpf(e.target.value));
            setLookup(null);
            setError(null);
          }}
          onBlur={() => {
            if (!lookup && cpf.replace(/\D/g, '').length === 11) {
              handleCheckCpf();
            }
          }}
          required
        />
        {lookup?.found && lookup.name && (
          <p className="text-xs text-muted-foreground">
            Olá, <span className="font-medium">{lookup.name}</span>
            {lookup.needsSetup
              ? ' — defina sua senha para começar a usar.'
              : ' — informe sua senha.'}
          </p>
        )}
      </div>

      {lookup?.found && (
        <>
          <div className="space-y-2">
            <Label htmlFor="pw">
              {lookup.needsSetup ? 'Nova senha' : 'Senha'}
            </Label>
            <Input
              id="pw"
              type="password"
              autoComplete={
                lookup.needsSetup ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {lookup.needsSetup && (
            <div className="space-y-2">
              <Label htmlFor="cpw">Confirmar senha</Label>
              <Input
                id="cpw"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Mínimo 8 caracteres. Anote — em caso de esquecimento, o
                gerente da loja recupera o acesso.
              </p>
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting
          ? 'Aguarde…'
          : !lookup
            ? 'Verificar'
            : lookup.needsSetup
              ? 'Cadastrar e entrar'
              : 'Entrar'}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Bloco do modo demo                                                  */
/* ------------------------------------------------------------------ */

function DemoBlock({
  onLogin,
  onReset,
}: {
  onLogin: (username: string) => Promise<void>;
  onReset: () => void;
}) {
  const [showDemo, setShowDemo] = useState(false);
  const [demoSubmitting, setDemoSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(u: string) {
    setError(null);
    setDemoSubmitting(u);
    try {
      await onLogin(u);
    } catch (err) {
      const detail =
        (isAxiosError(err) && err.response?.data?.message) ||
        'Não foi possível entrar no modo demo.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setDemoSubmitting(null);
    }
  }

  return (
    <div className="mt-2 border-t pt-4">
      <button
        type="button"
        onClick={() => setShowDemo((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-medium text-primary hover:underline"
      >
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-4" />
          Modo demonstração
        </span>
        <span className="text-muted-foreground">{showDemo ? '−' : '+'}</span>
      </button>

      {showDemo && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Login simulado sem banco de dados — fluxos rodam em memória.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            {DEMO_USERS.map((u) => (
              <button
                type="button"
                key={u.username}
                onClick={() => handle(u.username)}
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
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            Resetar dados demo
          </button>
        </div>
      )}
    </div>
  );
}
