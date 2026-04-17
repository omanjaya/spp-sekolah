'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, School, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiFetch } from '@/lib/http';
import { cn } from '@/lib/utils';

export interface RombelItem {
  id: string;
  kode: string;
  grade: string;
  nomor: number;
  tahunAjaranId: string;
  waliKelas?: string | null;
}

export interface RombelComboboxProps {
  value?: string;
  onChange: (id: string, rombel: RombelItem | null) => void;
  tahunAjaranId?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
}

/**
 * Rombel picker. Fetches `/api/v1/rombel` (optionally scoped to a tahun ajaran)
 * and filters client-side — rombel counts are always small (<100 per year).
 */
export function RombelCombobox({
  value,
  onChange,
  tahunAjaranId,
  placeholder = 'Pilih rombel…',
  disabled,
  className,
  allowClear = true,
}: RombelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['rombel', 'list', tahunAjaranId ?? 'all'],
    queryFn: async () => {
      const params: Record<string, string | number | undefined> = { limit: 200 };
      if (tahunAjaranId) params.tahunAjaranId = tahunAjaranId;
      return apiFetch<RombelItem[]>('/api/v1/rombel', { searchParams: params });
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.kode.toLowerCase().includes(q) ||
        r.grade.toLowerCase().includes(q) ||
        (r.waliKelas ?? '').toLowerCase().includes(q),
    );
  }, [data, query]);

  const selected = useMemo(() => {
    if (!value) return null;
    return (data ?? []).find((r) => r.id === value) ?? null;
  }, [data, value]);

  function handleSelect(item: RombelItem) {
    onChange(item.id, item);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('', null);
  }

  const display = selected ? selected.kode : placeholder;

  return (
    <div className={cn('relative', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'w-full justify-between font-normal',
              !selected && 'text-muted-foreground',
            )}
          >
            <span className="flex min-w-0 items-center gap-2 truncate">
              <School className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate">{display}</span>
            </span>
            <span className="ml-2 flex items-center gap-1">
              {allowClear && selected ? (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={handleClear}
                  aria-label="Hapus pilihan"
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              ) : null}
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Cari kode rombel…"
            />
            <CommandList>
              {isFetching ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Memuat…
                </div>
              ) : null}
              <CommandEmpty>Tidak ada rombel.</CommandEmpty>
              <CommandGroup>
                {filtered.map((item) => {
                  const active = item.id === value;
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => handleSelect(item)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          active ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">{item.kode}</span>
                        {item.waliKelas ? (
                          <span className="text-xs text-slate-500">
                            Wali: {item.waliKelas}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
