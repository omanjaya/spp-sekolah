'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MONTH_LABELS, type PeriodCell } from '@/components/pickers/month-range-picker';
import { cn } from '@/lib/utils';

export interface MonthMultiPickerProps {
  value: PeriodCell[];
  onChange: (value: PeriodCell[]) => void;
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  className?: string;
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agt',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

function keyOf(year: number, month: number) {
  return `${year}-${month}`;
}

/**
 * Multi-select month grid. User navigates per year; ticks checkboxes to add
 * (year, month) tuples to `value`. Used for bulk keringanan assign.
 */
export function MonthMultiPicker({
  value,
  onChange,
  minYear,
  maxYear,
  disabled,
  className,
}: MonthMultiPickerProps) {
  const now = new Date();
  const minY = minYear ?? now.getFullYear() - 3;
  const maxY = maxYear ?? now.getFullYear() + 3;
  const [currentYear, setCurrentYear] = useState<number>(() => now.getFullYear());

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = minY; y <= maxY; y++) out.push(y);
    return out;
  }, [minY, maxY]);

  const selectedSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of value) set.add(keyOf(p.year, p.month));
    return set;
  }, [value]);

  function toggle(month: number) {
    const key = keyOf(currentYear, month);
    const has = selectedSet.has(key);
    if (has) {
      onChange(value.filter((p) => !(p.year === currentYear && p.month === month)));
    } else {
      onChange([...value, { year: currentYear, month }]);
    }
  }

  function selectAllThisYear() {
    const existing = value.filter((p) => p.year !== currentYear);
    const added: PeriodCell[] = [];
    for (let m = 1; m <= 12; m++) added.push({ year: currentYear, month: m });
    onChange([...existing, ...added]);
  }

  function clearThisYear() {
    onChange(value.filter((p) => p.year !== currentYear));
  }

  function goPrev() {
    setCurrentYear((y) => Math.max(minY, y - 1));
  }
  function goNext() {
    setCurrentYear((y) => Math.min(maxY, y + 1));
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={goPrev}
            disabled={disabled || currentYear <= minY}
            aria-label="Tahun sebelumnya"
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Select
            value={String(currentYear)}
            onValueChange={(v) => setCurrentYear(Number(v))}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-28" aria-label="Tahun">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={goNext}
            disabled={disabled || currentYear >= maxY}
            aria-label="Tahun berikutnya"
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={selectAllThisYear}
            disabled={disabled}
            className="h-8 text-xs"
          >
            Pilih semua
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearThisYear}
            disabled={disabled}
            className="h-8 text-xs"
          >
            Kosongkan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {MONTH_SHORT.map((label, idx) => {
          const month = idx + 1;
          const key = keyOf(currentYear, month);
          const checked = selectedSet.has(key);
          return (
            <label
              key={label}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                checked
                  ? 'border-slate-900 bg-slate-900/5 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                disabled && 'pointer-events-none opacity-60',
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(month)}
                aria-label={`${MONTH_LABELS[idx]} ${currentYear}`}
              />
              <span className="flex-1 truncate">
                {label} <span className="text-slate-400">{currentYear}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="text-xs text-slate-500">
        Total terpilih: <span className="font-semibold text-slate-900">{value.length}</span> bulan
      </div>
    </div>
  );
}
