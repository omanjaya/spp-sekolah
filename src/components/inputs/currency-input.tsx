'use client';

import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const formatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export function formatRupiah(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'string' ? Number(value.replace(/\D/g, '')) : value;
  if (Number.isNaN(n)) return '';
  return `Rp ${formatter.format(n)}`;
}

interface CurrencyInputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'onChange' | 'value'> {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput({ value, onChange, className, ...rest }, ref) {
    const displayed = value === null || value === undefined ? '' : formatter.format(value);
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
          Rp
        </span>
        <Input
          ref={ref}
          inputMode="numeric"
          className={cn('pl-10 font-mono', className)}
          value={displayed}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            onChange(digits === '' ? null : Number(digits));
          }}
          {...rest}
        />
      </div>
    );
  },
);
