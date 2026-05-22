import {
  CircleCheck,
  CircleX,
  FileText,
  History,
  PackageCheck,
  Pencil,
  RefreshCw,
  Send,
  Undo2,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface HistoryEvent {
  at: string;
  kind: string;
  label: string;
  who?: string | null;
  detail?: string | null;
}

interface Props {
  events: HistoryEvent[] | undefined;
  title?: string;
}

/**
 * Card de timeline cronológica — usado em PC, Req, SV.
 * Cores e ícones por `kind`. Eventos chegam pré-ordenados pelo backend.
 */
export function HistoryTimeline({ events, title = 'Histórico' }: Props) {
  if (!events || events.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {events.map((ev, i) => (
            <HistoryRow key={`${ev.at}-${i}`} ev={ev} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function HistoryRow({ ev }: { ev: HistoryEvent }) {
  const { Icon, color } = (() => {
    switch (ev.kind) {
      case 'created':
        return { Icon: FileText, color: 'text-primary' };
      case 'submitted':
        return { Icon: Send, color: 'text-foreground' };
      case 'approved':
      case 'step-approved':
        return { Icon: CircleCheck, color: 'text-emerald-600' };
      case 'sent':
        return { Icon: Send, color: 'text-foreground' };
      case 'integrated':
        return { Icon: CircleCheck, color: 'text-primary' };
      case 'received':
        return { Icon: PackageCheck, color: 'text-foreground' };
      case 'edited':
        return { Icon: Pencil, color: 'text-warning' };
      case 'revision':
      case 'step-revision':
        return { Icon: Undo2, color: 'text-warning' };
      case 'recurrence':
        return { Icon: RefreshCw, color: 'text-primary' };
      case 'cancelled':
      case 'rejected':
      case 'step-rejected':
        return { Icon: CircleX, color: 'text-destructive' };
      default:
        return { Icon: FileText, color: 'text-muted-foreground' };
    }
  })();
  return (
    <li className="flex gap-3">
      <div className={`mt-0.5 ${color}`}>
        <Icon className="size-4" />
      </div>
      <div className="flex-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{ev.label}</span>
          <span className="text-xs text-muted-foreground">
            {formatDate(ev.at)}
          </span>
        </div>
        {(ev.who || ev.detail) && (
          <p className="text-xs text-muted-foreground">
            {[ev.who, ev.detail].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </li>
  );
}
