import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface AppNotification {
  id: string;
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Lista todas as notificações do usuário (top 100). */
export function useMyNotifications() {
  return useQuery({
    queryKey: ['notifications', 'mine'],
    queryFn: async () =>
      (await api.get<AppNotification[]>('/notifications/mine')).data,
    refetchInterval: 60_000, // refresca de minuto em minuto
  });
}

/** Contagem leve de não-lidas — alimenta o badge do sino. */
export function useUnreadNotificationsCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () =>
      (
        await api.get<{ count: number }>('/notifications/unread-count')
      ).data.count,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/notifications/${id}/read`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post('/notifications/read-all')).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** Constrói o link de navegação a partir do entityType da notificação. */
export function notificationLink(n: AppNotification): string | null {
  if (!n.entityType || !n.entityId) return null;
  switch (n.entityType) {
    case 'REQUISITION':
    case 'Requisition':
      return `/requisicoes/${n.entityId}`;
    case 'PURCHASE_ORDER':
    case 'PurchaseOrder':
      return `/pedidos/${n.entityId}`;
    case 'FUND_REQUEST':
    case 'FundRequest':
      return `/solicitacoes-verba/${n.entityId}`;
    case 'PRODUCT_ORDER_PA':
      return `/pedidos-pa/${n.entityId}`;
    default:
      return null;
  }
}
