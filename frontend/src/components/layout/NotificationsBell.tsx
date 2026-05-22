import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';
import {
  notificationLink,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMyNotifications,
  useUnreadNotificationsCount,
  type AppNotification,
} from '@/lib/notifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime } from '@/lib/format';

/**
 * Sino de notificações no Topbar. Badge mostra contagem de não-lidas
 * (refetch a cada 60s). Dropdown com top 100 do usuário, click navega
 * pra entidade e marca como lida.
 */
export function NotificationsBell() {
  const navigate = useNavigate();
  const { data: list = [] } = useMyNotifications();
  const { data: unread = 0 } = useUnreadNotificationsCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  function openNotification(n: AppNotification) {
    if (!n.readAt) markRead.mutate(n.id);
    const link = notificationLink(n);
    if (link) navigate(link);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex items-center rounded-md p-2 hover:bg-accent"
        aria-label="Notificações"
      >
        <Bell className="size-5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" />
              Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {list.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação ainda.
            </p>
          ) : (
            list.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openNotification(n)}
                className={`flex w-full items-start gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent ${n.readAt ? 'opacity-70' : ''}`}
              >
                <div
                  className={`mt-1 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-muted' : 'bg-primary'}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {n.body}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {formatDateTime(n.createdAt)}
                  </p>
                </div>
                {n.readAt && (
                  <Check className="mt-0.5 size-3 text-muted-foreground" />
                )}
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
