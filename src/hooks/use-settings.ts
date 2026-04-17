'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/http';
import type { SettingDTO } from '@/types/domain';
import type { SettingBulkInput } from '@/lib/validators/setting.schema';

export const settingKeys = {
  all: ['settings'] as const,
  list: () => ['settings', 'list'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingKeys.list(),
    queryFn: () => apiFetch<SettingDTO[]>('/api/v1/settings'),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingBulkInput) =>
      apiFetch<SettingDTO[]>('/api/v1/settings', { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingKeys.all }),
  });
}

/**
 * Util: konversi array Setting ke map key -> value (unknown).
 */
export function settingsToMap(list: SettingDTO[] | undefined): Record<string, unknown> {
  if (!list) return {};
  const map: Record<string, unknown> = {};
  for (const s of list) {
    map[s.key] = s.value;
  }
  return map;
}
