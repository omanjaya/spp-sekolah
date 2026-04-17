'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/http';
import type { AuditLogRow } from '@/services/audit.service';

export interface UseAuditLogParams {
  userId?: string;
  action?: string;
  entity?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export function useAuditLog(params: UseAuditLogParams = {}) {
  return useQuery({
    queryKey: ['audit-log', params],
    queryFn: () =>
      apiFetch<AuditLogRow[]>('/api/v1/audit-log', {
        searchParams: {
          userId: params.userId,
          action: params.action,
          entity: params.entity,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          page: params.page,
          limit: params.limit,
        },
      }),
  });
}
