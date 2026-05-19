import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Login provisório — autenticação LDAP/JWT será implementada na Etapa F2. */
export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="flex items-center gap-1">
            <span className="text-3xl font-extrabold tracking-tight text-foreground">
              HRG
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-2xl font-extrabold text-white">
              3
            </span>
          </div>
          <CardTitle className="mt-2">Procure-to-Pay</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Tela de login — será implementada na Etapa F2 (autenticação LDAP/JWT).
        </CardContent>
      </Card>
    </div>
  );
}
