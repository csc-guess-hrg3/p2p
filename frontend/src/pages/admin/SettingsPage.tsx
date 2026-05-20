import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useSystemSettings,
  useUpdateSetting,
  type SystemSettingItem,
} from '@/lib/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function SettingRow({
  setting,
  companyId,
}: {
  setting: SystemSettingItem;
  companyId: string;
}) {
  const { toast } = useToast();
  const updateMut = useUpdateSetting();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(setting.value);

  async function save() {
    try {
      await updateMut.mutateAsync({ companyId, key: setting.key, value });
      toast({
        title: 'Parâmetro atualizado',
        description: setting.label,
        variant: 'success',
      });
      setEditing(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao salvar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <TableRow>
      <TableCell className="align-top">
        <p className="font-medium">{setting.label}</p>
        {setting.description && (
          <p className="text-xs text-muted-foreground">{setting.description}</p>
        )}
      </TableCell>
      <TableCell className="align-top">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              className="w-32"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={save}
              disabled={updateMut.isPending}
            >
              <Check className="size-4 text-emerald-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(setting.value);
                setEditing(false);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-transparent px-2 py-1 font-mono text-sm hover:border-border hover:bg-muted/50"
          >
            {setting.value}
          </button>
        )}
      </TableCell>
      <TableCell className="align-top text-xs text-muted-foreground">
        {setting.isDefault ? 'Padrão' : 'Personalizado'}
      </TableCell>
    </TableRow>
  );
}

export function SettingsPage() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;
  const { data: settings = [], isLoading } = useSystemSettings(companyId);

  return (
    <div className="space-y-4 pb-10">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin">
          <ArrowLeft className="size-4" />
          Administração
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Parâmetros — {activeCompany?.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parâmetro</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && settings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Nenhum parâmetro configurável.
                  </TableCell>
                </TableRow>
              )}
              {companyId &&
                settings.map((s) => (
                  <SettingRow key={s.key} setting={s} companyId={companyId} />
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
