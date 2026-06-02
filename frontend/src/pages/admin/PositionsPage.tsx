import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  useCreatePosition,
  useDeletePosition,
  usePositions,
  useUpdatePosition,
} from '@/lib/positions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * CRUD simples de Cargos. Usado pela cadeia de aprovação dinâmica:
 * o nível da cadeia pode apontar para um cargo ("Supervisor"), e o
 * engine resolve no submit qual usuário com aquele cargo aprova.
 */
export function PositionsPage() {
  const { toast } = useToast();
  const { data: positions = [], isLoading } = usePositions();
  const createMut = useCreatePosition();
  const updateMut = useUpdatePosition();
  const deleteMut = useDeletePosition();

  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  async function create() {
    const code = newCode.trim().toUpperCase();
    const name = newName.trim();
    if (!code || !name) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe código e nome.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await createMut.mutateAsync({ code, name });
      setNewCode('');
      setNewName('');
      toast({ title: 'Cargo criado', variant: 'success' });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao criar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  async function rename(id: string, name: string) {
    try {
      await updateMut.mutateAsync({ id, patch: { name } });
    } catch {
      toast({ title: 'Falha ao renomear', variant: 'destructive' });
    }
  }

  async function toggleActive(id: string, active: boolean) {
    try {
      await updateMut.mutateAsync({ id, patch: { active } });
    } catch {
      toast({ title: 'Falha ao atualizar', variant: 'destructive' });
    }
  }

  async function remove(id: string) {
    try {
      await deleteMut.mutateAsync(id);
      toast({ title: 'Cargo excluído', variant: 'success' });
    } catch {
      toast({ title: 'Falha ao excluir', variant: 'destructive' });
    }
  }

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
          <CardTitle>Cargos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cargos amarram pessoas a níveis na cadeia de aprovação. O
            código é uma chave técnica (ex.: <code>SUPERVISOR</code>); o
            nome é o que aparece nas telas.
          </p>

          {/* Form de criação */}
          <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row">
            <Input
              className="sm:max-w-[14rem]"
              placeholder="Código (ex.: SUPERVISOR)"
              value={newCode}
              onChange={(e) =>
                setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))
              }
            />
            <Input
              className="flex-1"
              placeholder="Nome do cargo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button onClick={create} disabled={createMut.isPending}>
              <Plus className="size-4" />
              {createMut.isPending ? 'Criando…' : 'Adicionar'}
            </Button>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-32">Ativo</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && positions.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nenhum cargo cadastrado.
                    </TableCell>
                  </TableRow>
                )}
                {positions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell>
                      <Input
                        defaultValue={p.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== p.name) rename(p.id, v);
                        }}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.active}
                        onCheckedChange={(v) => toggleActive(p.id, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir cargo"
        description={
          deleteTarget
            ? `Excluir o cargo "${deleteTarget.name}"? Cadeias que o usam podem ficar sem referencia.`
            : undefined
        }
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await remove(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
