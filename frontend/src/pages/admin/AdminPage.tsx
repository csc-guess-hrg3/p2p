import { Link } from 'react-router-dom';
import {
  Building2,
  ChevronRight,
  Settings,
  Users,
  Workflow,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminCardProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  available?: boolean;
}

function AdminCard({
  to,
  icon: Icon,
  title,
  description,
  available = true,
}: AdminCardProps) {
  const content = (
    <Card
      className={`h-full transition ${available ? 'hover:border-primary/50 hover:shadow-sm' : 'opacity-60'}`}
    >
      <CardHeader className="flex-row items-start justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-primary" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {available && <ChevronRight className="size-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
        {!available && (
          <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
            Em breve
          </p>
        )}
      </CardContent>
    </Card>
  );
  return available ? <Link to={to}>{content}</Link> : <div>{content}</div>;
}

export function AdminPage() {
  return (
    <div className="space-y-4 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Administração</h1>
        <p className="text-sm text-muted-foreground">
          Configurações da plataforma e da integração com o ERP.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <AdminCard
          to="/admin/integracao-erp"
          icon={Building2}
          title="Integração com o ERP"
          description="Defaults da gravação (tipo de compra, operação contábil, natureza) e SMTP para envio do pedido ao fornecedor — por empresa."
        />
        <AdminCard
          to="/admin/parametros"
          icon={Settings}
          title="Parâmetros da plataforma"
          description="Limites e regras configuráveis: cotações mínimas por valor, tolerância de recebimento, etc."
        />
        <AdminCard
          to="/admin/usuarios"
          icon={Users}
          title="Usuários"
          description="Aprovar primeiros acessos, definir perfil e empresas, ativar/desativar."
          available={false}
        />
        <AdminCard
          to="/admin/alcadas"
          icon={Workflow}
          title="Alçadas e equipes"
          description="Cadeia de aprovação por equipe e níveis de alçada."
          available={false}
        />
      </div>
    </div>
  );
}
