import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import {
  FlaskConical,
  RotateCcw,
  Server,
  Sparkles,
  Store,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getEnvironment, setEnvironment, type AppEnv } from '@/lib/api';
import { extractApiMessage } from '@/lib/api-errors';
import { TurnstileWidget } from '@/components/TurnstileWidget';
import { storeLookup, type StoreLookupResult } from '@/lib/store-auth';
import {
  DEMO_STORE_USERS,
  DEMO_USERS,
  PROFILE_LABELS,
  type DemoStoreUser,
} from '@/lib/demo/catalog';
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
 *
 * Ambiente (PROD/HML) é escolhido AQUI e fica travado durante a sessão.
 * Pra trocar, basta deslogar e escolher de novo no próximo login. Isso
 * mantém autenticações independentes por ambiente e elimina a categoria
 * de bug "JWT de um env mandado pro outro".
 */
export function LoginPage() {
  const { user, loading, login, loginLocal, loginStore, loginDemo } =
    useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [storeMode, setStoreMode] = useState(false);
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

  function handleResetDemo() {
    resetDemoState();
    toast({
      title: 'Dados demo resetados',
      description: 'O estado simulado voltou ao seed inicial.',
      variant: 'success',
    });
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
              onLogin={(cpf, pw, isSetup, turnstileToken) =>
                loginStore(cpf, pw, { isSetup, turnstileToken }).then(() =>
                  navigate('/', { replace: true }),
                )
              }
            />
          ) : (
            <StandardLoginForm
              onLogin={async (identifier, password, turnstileToken) => {
                // Backend AD tenta primeiro; se rejeitar com 401, caímos
                // em login-local com o mesmo identifier (username).
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
          )}

          <EnvironmentToggle value={env} onChange={setEnv} />

          <DemoBlock
            storeMode={storeMode}
            onCorporateLogin={(u) =>
              loginDemo(u).then(() => navigate('/', { replace: true }))
            }
            onStoreLogin={async (v) => {
              // Garante que o modo demo está ativo antes do storeLookup,
              // senão o axios bate no backend real (que não conhece esses CPFs).
              const { setDemoMode } = await import('@/lib/demo/state');
              setDemoMode(true);
              // Senha padrão demo. Para o vendedor que precisa setup, isso
              // dispara o endpoint store-setup-password (cria + ativa);
              // para o já cadastrado, é a senha definida no seed.
              await loginStore(v.cpf, 'demo1234', {
                isSetup: v.needsSetup,
              });
              navigate('/', { replace: true });
            }}
            onReset={handleResetDemo}
          />
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
  onLogin: (
    cpf: string,
    password: string,
    isSetup: boolean,
    turnstileToken?: string,
  ) => Promise<void>;
}) {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [lookup, setLookup] = useState<StoreLookupResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');

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
      await onLogin(cpf, password, lookup.needsSetup, turnstileToken);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) {
        setError('Senha inválida.');
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
      <TurnstileWidget onVerify={setTurnstileToken} />
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

/* ------------------------------------------------------------------ */
/* Bloco do modo demo                                                  */
/* ------------------------------------------------------------------ */

function DemoBlock({
  storeMode,
  onCorporateLogin,
  onStoreLogin,
  onReset,
}: {
  storeMode: boolean;
  onCorporateLogin: (username: string) => Promise<void>;
  onStoreLogin: (vendor: DemoStoreUser) => Promise<void>;
  onReset: () => void;
}) {
  const [showDemo, setShowDemo] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCorporate(u: string) {
    setError(null);
    setSubmitting(u);
    try {
      await onCorporateLogin(u);
    } catch (err) {
      const detail =
        (isAxiosError(err) && err.response?.data?.message) ||
        'Não foi possível entrar no modo demo.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleStore(v: DemoStoreUser) {
    setError(null);
    setSubmitting(v.cpf);
    try {
      await onStoreLogin(v);
    } catch (err) {
      const detail =
        (isAxiosError(err) && err.response?.data?.message) ||
        'Não foi possível entrar no modo demo.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setSubmitting(null);
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
          Modo demonstração — {storeMode ? 'Loja' : 'Corporativo'}
        </span>
        <span className="text-muted-foreground">{showDemo ? '−' : '+'}</span>
      </button>

      {showDemo && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {storeMode
              ? 'Vendedores de loja simulados — sem backend real. Senha padrão: demo1234.'
              : 'Login simulado sem banco de dados — fluxos rodam em memória.'}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-2">
            {storeMode
              ? DEMO_STORE_USERS.map((v) => (
                  <button
                    type="button"
                    key={v.cpf}
                    onClick={() => handleStore(v)}
                    disabled={submitting !== null}
                    className="w-full rounded-md border border-input bg-background p-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{v.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {v.needsSetup ? '1º acesso' : 'Já cadastrado'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{v.cpfMasked}</span>
                      {' • '}
                      {v.branchHint}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {v.description}
                    </p>
                  </button>
                ))
              : DEMO_USERS.map((u) => (
                  <button
                    type="button"
                    key={u.username}
                    onClick={() => handleCorporate(u.username)}
                    disabled={submitting !== null}
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
