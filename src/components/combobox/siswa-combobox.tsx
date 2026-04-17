'use client';

import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

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
import { useSiswaSearch, type SiswaSearchItem } from '@/hooks/use-siswa-search';
import { cn } from '@/lib/utils';

export interface SiswaComboboxProps {
  value?: string;
  onChange: (id: string, siswa: SiswaSearchItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When true, clear button is shown next to the trigger. */
  allowClear?: boolean;
}

/**
 * Async siswa picker powered by `/api/v1/siswa?search=...`.
 *
 * - Debounce 250ms (handled by `useSiswaSearch`).
 * - `keepPreviousData` keeps list stable while user types.
 * - Shows "NIS — Nama" in both trigger and list items.
 */
export function SiswaCombobox({
  value,
  onChange,
  placeholder = 'Cari siswa (NIS atau nama)…',
  disabled,
  className,
  allowClear = true,
}: SiswaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SiswaSearchItem | null>(null);

  const { data, isFetching } = useSiswaSearch(query, {
    enabled: open,
    alwaysFetch: true,
    limit: 20,
  });

  // Hydrate selected from `value` — if parent passes an id we don't know yet,
  // attempt a lookup against the current result set. A full by-id fetch would
  // require an endpoint we don't own; parents that render this with a known
  // `value` outside of user interaction should also pass the siswa object in
  // via `onChange` to keep `selected` accurate.
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    const fromList = data?.find((item) => item.id === value) ?? null;
    if (fromList) setSelected(fromList);
  }, [value, data, selected?.id]);

  function handleSelect(item: SiswaSearchItem) {
    setSelected(item);
    onChange(item.id, item);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(null);
    onChange('', null);
  }

  const display = selected ? `${selected.nis} — ${selected.nama}` : placeholder;

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
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
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
              placeholder="Ketik NIS atau nama…"
            />
            <CommandList>
              {isFetching ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Memuat…
                </div>
              ) : null}
              <CommandEmpty>Tidak ada siswa.</CommandEmpty>
              <CommandGroup>
                {(data ?? []).map((item) => {
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
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-mono text-xs text-slate-500">
                          {item.nis}
                        </span>
                        <span className="truncate text-sm text-slate-900">{item.nama}</span>
                      </span>
                      <span className="ml-auto text-xs text-slate-400">
                        Angkatan {item.angkatan}
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
