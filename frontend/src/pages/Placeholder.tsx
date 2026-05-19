import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PlaceholderProps {
  title: string;
  etapa: string;
}

/** Página provisória — substituída pela etapa indicada. */
export function Placeholder({ title, etapa }: PlaceholderProps) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Módulo em construção — será implementado na {etapa}.
      </CardContent>
    </Card>
  );
}
