import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
  requireSpecial: boolean;
  description: string;
}

/**
 * Página pública (sem auth) acionada pelo link recebido por e-mail:
 *   /definir-senha?token=XXX
 *
 * Valida a senha contra a política do backend (busca /auth/password-policy),
 * mostra os requisitos em tempo real e envia para /auth/setup-password.
 * Em caso de sucesso, redireciona pro login com mensagem.
 */
export function SetupPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .get<PasswordPolicy>('/auth/password-policy')
      .then((r) => setPolicy(r.data))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(() => navigate('/login', { replace: true }), 2000);
    return () => clearTimeout(timer);
  }, [done, navigate]);

  const checks = policy
    ? [
        {
          ok: password.length >= policy.minLength,
          label: `≥ ${policy.minLength} caracteres`,
        },
        policy.requireUpper && {
          ok: /[A-Z]/.test(password),
          label: '1 letra maiúscula',
        },
        policy.requireLower && {
          ok: /[a-z]/.test(password),
          label: '1 letra minúscula',
        },
        policy.requireDigit && { ok: /\d/.test(password), label: '1 número' },
        policy.requireSpecial && {
          ok: /[^A-Za-z0-9]/.test(password),
          label: '1 caractere especial',
        },
      ].filter(Boolean) as Array<{ ok: boolean; label: string }>
    : [];
  const allChecksOk = checks.every((c) => c.ok);
  const matches = password.length > 0 && password === confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Link inválido — abra novamente pelo e-mail recebido.');
      return;
    }
    if (!allChecksOk) {
      setError('A senha não atende todos os requisitos.');
      return;
    }
    if (!matches) {
      setError('A confirmação de senha não bate.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/setup-password', { token, password });
      setDone(true);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      setError(msg || 'Não foi possível definir a senha. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="text-lg font-semibold">Link inválido</h1>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Este link de definição de senha está incompleto. Abra o e-mail
              recebido e clique novamente no link.
            </p>
            <Button onClick={() => navigate('/login')}>Ir para o login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <CheckCircle2 className="size-12 text-emerald-600" />
            <p className="text-lg font-semibold">Senha definida!</p>
            <p className="text-sm text-muted-foreground">
              Redirecionando para o login…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <h1 className="text-lg font-semibold">Defina sua senha</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Escolha uma senha forte. Você usará seu e-mail corporativo (ou
            CPF) + esta senha para acessar o P2P.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw">Nova senha</Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpw">Confirmar senha</Label>
              <Input
                id="cpw"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {checks.length > 0 && (
              <ul className="space-y-1 text-xs">
                {checks.map((c) => (
                  <li
                    key={c.label}
                    className={c.ok ? 'text-emerald-600' : 'text-muted-foreground'}
                  >
                    {c.ok ? '✓' : '○'} {c.label}
                  </li>
                ))}
                {confirm.length > 0 && (
                  <li
                    className={
                      matches ? 'text-emerald-600' : 'text-destructive'
                    }
                  >
                    {matches ? '✓' : '✗'} senhas iguais
                  </li>
                )}
              </ul>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !allChecksOk || !matches}
            >
              {submitting ? 'Salvando…' : 'Definir senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
