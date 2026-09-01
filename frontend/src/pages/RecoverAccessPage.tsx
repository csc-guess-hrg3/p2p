import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, MailCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { extractApiMessage } from '@/lib/api-errors';
import { TurnstileWidget, TURNSTILE_ENABLED } from '@/components/TurnstileWidget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * "Primeiro acesso / Esqueci minha senha" — self-service (público).
 *
 * O usuário informa o E-MAIL; se casar com uma conta LOCAL ativa, o backend
 * envia o link (já com o login e a definição de senha). A resposta é SEMPRE
 * neutra — não revela se o e-mail existe (anti-enumeração). Serve pra qualquer
 * usuário local (representante, supervisor). Usuário AD não recebe: a senha
 * dele vive no AD/rede.
 */
export function RecoverAccessPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await api.post('/auth/forgot-password', {
        email: email.trim(),
        turnstileToken,
      });
      setSent(true);
    } catch (err) {
      setError(
        extractApiMessage(err, 'Não foi possível enviar. Tente novamente.'),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <h1 className="text-lg font-semibold">Recuperar acesso</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Primeiro acesso ou esqueceu a senha? Informe seu e-mail cadastrado —
            enviaremos o link com o seu login e a definição de senha.
          </p>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                <MailCheck className="mt-0.5 size-5 shrink-0" />
                <p>
                  Se o e-mail estiver cadastrado, enviamos as instruções de
                  acesso. Verifique sua caixa de entrada (e o spam).
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(-1)}
              >
                Voltar ao login
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail cadastrado</Label>
                <Input
                  id="email"
                  type="email"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <TurnstileWidget onVerify={setTurnstileToken} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={
                  sending ||
                  !email ||
                  (TURNSTILE_ENABLED && !turnstileToken)
                }
              >
                {sending
                  ? 'Enviando…'
                  : TURNSTILE_ENABLED && !turnstileToken
                    ? 'Verificando…'
                    : 'Enviar link de acesso'}
              </Button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Voltar ao login
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
