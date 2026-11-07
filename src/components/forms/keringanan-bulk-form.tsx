'use client';

import { Loader2, Search, Users2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { MonthMultiPicker } from '@/components/pickers/month-multi-picker';
import type { PeriodCell } from '@/components/pickers/month-range-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useSiswaSearch, type SiswaSearchItem } from '@/hooks/use-siswa-search';
import {
  JENIS_KERINGANAN,
  type JenisKeringanan,
  type KeringananBulkAssignInput,
} from '@/lib/validators/keringanan.schema';
import { cn } from '@/lib/utils';

const JENIS_LABEL: Record<JenisKeringanan, string> = {
  JUARA: 'Juara Lomba',
  OSN: 'OSN',
  JUARA_UMUM: 'Juara Umum',
  BEASISWA: 'Beasiswa',
  KELUARGA_TIDAK_MAMPU: 'Keluarga Tidak Mampu',
  PINDAHAN: 'Pindahan',
  IJAZAH: 'Ijazah',
  LAINNYA: 'Lainnya',
};

export interface KeringananBulkFormProps {
  onSubmit: (
    payload: KeringananBulkAssignInput,
    meta: { siswaCount: number; periodCount: number; entryCount: number },
  ) => Promise<void> | void;
  isSubmitting?: boolean;
  onCancel?: () => void;
}

/**
 * Bulk assign form: pilih banyak siswa + banyak bulan, satu jenis + persentase.
 * Server menggunakan `createMany({ skipDuplicates: true })` sehingga re-run aman.
 */
export function KeringananBulkForm({ onSubmit, isSubmitting, onCancel }: KeringananBulkFormProps) {
  const [selected, setSelected] = useState<SiswaSearchItem[]>([]);
  const [periods, setPeriods] = useState<PeriodCell[]>([]);
  const [jenis, setJenis] = useState<JenisKeringanan>('JUARA');
  const [persentase, setPersentase] = useState<number>(100);
  const [alasan, setAlasan] = useState<string>('');
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: searchResults, isFetching } = useSiswaSearch(query, {
    enabled: pickerOpen,
    alwaysFetch: true,
    limit: 20,
  });

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  function toggleSelect(item: SiswaSearchItem) {
    if (selectedIds.has(item.id)) {
      setSelected((prev) => prev.filter((s) => s.id !== item.id));
    } else {
      setSelected((prev) => [...prev, item]);
    }
  }
  function removeSelected(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }
  function clearAll() {
    setSelected([]);
  }

  const entryCount = selected.length * periods.length;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (selected.length === 0) next.siswa = 'Pilih minimal satu siswa.';
    if (periods.length === 0) next.periods = 'Pilih minimal satu bulan.';
    if (persentase < 0 || persentase > 100) next.persentase = 'Persentase harus 0–100.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload: KeringananBulkAssignInput = {
      siswaIds: selected.map((s) => s.id),
      periods: periods.map((p) => ({ year: p.year, month: p.month })),
      jenis,
      persentase,
      alasan: alasan.trim() || undefined,
    };
    await onSubmit(payload, {
      siswaCount: selected.length,
      periodCount: periods.length,
      entryCount,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormFieldWrapper label="Siswa terpilih" required error={errors.siswa}>
        <div className="space-y-2">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-between font-normal">
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span className="text-slate-600">Cari &amp; tambah siswa…</span>
                </span>
                <Users2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
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
                    {(searchResults ?? []).map((item) => {
                      const isPicked = selectedIds.has(item.id);
                      return (
                        <CommandItem
                          key={item.id}
                          value={item.id}
                          onSelect={() => toggleSelect(item)}
                        >
                          <span
                            className={cn(
                              'mr-2 flex h-4 w-4 items-center justify-center rounded border',
                              isPicked
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-300',
                            )}
                            aria-hidden="true"
                          >
                            {isPicked ? <span className="text-[10px] leading-none">✓</span> : null}
                          </span>
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

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              <span className="font-semibold text-slate-900">{selected.length}</span> siswa dipilih
            </span>
            {selected.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={clearAll}
              >
                Kosongkan
              </Button>
            ) : null}
          </div>

          {selected.length > 0 ? (
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/60 p-2">
              {selected.map((s) => (
                <Badge
                  key={s.id}
                  variant="secondary"
                  className="flex items-center gap-1 bg-white font-normal"
                >
                  <span className="font-mono text-[10px] text-slate-500">{s.nis}</span>
                  <span className="max-w-[180px] truncate">{s.nama}</span>
                  <button
                    type="button"
                    onClick={() => removeSelected(s.id)}
                    aria-label={`Hapus ${s.nama}`}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </FormFieldWrapper>

      <FormFieldWrapper label="Bulan yang dibebaskan" required error={errors.periods}>
        <MonthMultiPicker value={periods} onChange={setPeriods} />
      </FormFieldWrapper>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Jenis keringanan" required>
          <Select value={jenis} onValueChange={(v) => setJenis(v as JenisKeringanan)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JENIS_KERINGANAN.map((j) => (
                <SelectItem key={j} value={j}>
                  {JENIS_LABEL[j]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <FormFieldWrapper label="Persentase (%)" required error={errors.persentase}>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={persentase}
            onChange={(e) => setPersentase(Number(e.target.value))}
          />
        </FormFieldWrapper>
      </div>

      <FormFieldWrapper label="Alasan / catatan" hint="Opsional. Disimpan untuk setiap entri.">
        <Textarea
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </FormFieldWrapper>

      {entryCount > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Akan membuat <span className="font-semibold text-slate-900">{selected.length}</span> siswa
          × <span className="font-semibold text-slate-900">{periods.length}</span> bulan ={' '}
          <span className="font-semibold text-slate-900">{entryCount}</span> entri. Data duplikat
          akan dilewati otomatis.
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Batal
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Jalankan bulk assign
        </Button>
      </div>
    </form>
  );
}
