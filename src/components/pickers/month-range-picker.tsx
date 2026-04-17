'use client';

import { useMemo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface MonthRangeValue {
  /** Start month, format "YYYY-MM" */
  start: string;
  /** End month (inclusive), format "YYYY-MM" */
  end: string;
}

export interface PeriodCell {
  year: number;
  month: number;
}

export interface MonthRangePickerProps {
  value: MonthRangeValue | null;
  onChange: (value: MonthRangeValue | null) => void;
  /** Earliest year (inclusive). Default: current year - 3. */
  minYear?: number;
  /** Latest year (inclusive). Default: current year + 3. */
  maxYear?: number;
  disabled?: boolean;
  className?: string;
}

const MONTH_LABELS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parse(ym: string | undefined): { year: number; month: number } | null {
  if (!ym) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  if (m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function format(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

/**
 * Enumerate every period cell (inclusive) covered by a MonthRangeValue.
 * Returns empty array if value is null or invalid.
 */
export function enumerateMonthRange(value: MonthRangeValue | null): PeriodCell[] {
  if (!value) return [];
  const start = parse(value.start);
  const end = parse(value.end);
  if (!start || !end) return [];
  const startIdx = start.year * 12 + (start.month - 1);
  const endIdx = end.year * 12 + (end.month - 1);
  if (endIdx < startIdx) return [];
  const out: PeriodCell[] = [];
  for (let idx = startIdx; idx <= endIdx; idx++) {
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    out.push({ year, month });
  }
  return out;
}

/**
 * Count months inclusive between two YYYY-MM strings.
 */
export function countMonthsInRange(value: MonthRangeValue | null): number {
  return enumerateMonthRange(value).length;
}

/**
 * Two-dropdown month range picker. Prefer simplicity over a full calendar — the
 * domain only ever deals with YYYY-MM precision. Auto-clamps `end` if user
 * picks an end before start.
 */
export function MonthRangePicker({
  value,
  onChange,
  minYear,
  maxYear,
  disabled,
  className,
}: MonthRangePickerProps) {
  const now = new Date();
  const minY = minYear ?? now.getFullYear() - 3;
  const maxY = maxYear ?? now.getFullYear() + 3;

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = minY; y <= maxY; y++) out.push(y);
    return out;
  }, [minY, maxY]);

  const start = parse(value?.start);
  const end = parse(value?.end);

  function commit(nextStart: { year: number; month: number } | null, nextEnd: { year: number; month: number } | null) {
    if (!nextStart || !nextEnd) {
      onChange(null);
      return;
    }
    // Clamp — ensure end >= start.
    const startIdx = nextStart.year * 12 + (nextStart.month - 1);
    const endIdx = nextEnd.year * 12 + (nextEnd.month - 1);
    const normalized = endIdx < startIdx ? nextStart : nextEnd;
    onChange({
      start: format(nextStart.year, nextStart.month),
      end: format(normalized.year, normalized.month),
    });
  }

  function setStartYear(y: string) {
    const year = Number(y);
    const month = start?.month ?? 7;
    const next = { year, month };
    commit(next, end ?? next);
  }
  function setStartMonth(m: string) {
    const month = Number(m);
    const year = start?.year ?? now.getFullYear();
    const next = { year, month };
    commit(next, end ?? next);
  }
  function setEndYear(y: string) {
    const year = Number(y);
    const month = end?.month ?? 6;
    const next = { year, month };
    commit(start ?? next, next);
  }
  function setEndMonth(m: string) {
    const month = Number(m);
    const year = end?.year ?? now.getFullYear();
    const next = { year, month };
    commit(start ?? next, next);
  }

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-600">Periode mulai</div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={start ? String(start.month) : undefined}
            onValueChange={setStartMonth}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Bulan mulai">
              <SelectValue placeholder="Bulan" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, idx) => (
                <SelectItem key={label} value={String(idx + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={start ? String(start.year) : undefined}
            onValueChange={setStartYear}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Tahun mulai">
              <SelectValue placeholder="Tahun" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-600">Periode akhir</div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={end ? String(end.month) : undefined}
            onValueChange={setEndMonth}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Bulan akhir">
              <SelectValue placeholder="Bulan" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, idx) => (
                <SelectItem key={label} value={String(idx + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={end ? String(end.year) : undefined}
            onValueChange={setEndYear}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Tahun akhir">
              <SelectValue placeholder="Tahun" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export { MONTH_LABELS };
