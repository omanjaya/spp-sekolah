'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/http';
import type { UserDTO } from '@/types/domain';
import type {
  AdminChangePasswordInput,
  SelfChangePasswordInput,
  UserCreateInput,
  UserUpdateInput,
} from '@/lib/validators/user.schema';

export const userKeys = {
  all: ['users'] as const,
  list: () => ['users', 'list'] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
};

export function useUserList() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: () => apiFetch<UserDTO[]>('/api/v1/users'),
  });
}

export function useUserDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: userKeys.detail(id ?? ''),
    queryFn: () => apiFetch<UserDTO>(`/api/v1/users/${id}`),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserCreateInput) =>
      apiFetch<UserDTO>('/api/v1/users', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UserUpdateInput }) =>
      apiFetch<UserDTO>(`/api/v1/users/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/v1/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useAdminChangePassword() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminChangePasswordInput }) =>
      apiFetch<{ id: string }>(`/api/v1/users/${id}/change-password`, {
        method: 'POST',
        body: input,
      }),
  });
}

export function useSelfChangePassword() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SelfChangePasswordInput }) =>
      apiFetch<{ id: string }>(`/api/v1/users/${id}/change-password`, {
        method: 'POST',
        body: input,
      }),
  });
}
