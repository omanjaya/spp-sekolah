import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export type StatCardTone = 'default' | 'success' | 'warning' | 'danger';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatCardTone;
  className?: string;
}

const toneStyles: Record<StatCardTone, { icon: string; bg: string }> = {
  default: { icon: 'text-slate-700', bg: 'bg-slate-100' },
  success: { icon: 'text-emerald-700', bg: 'bg-emerald-50' },
  warning: { icon: 'text-amber-700', bg: 'bg-amber-50' },
  danger: { icon: 'text-red-700', bg: 'bg-red-50' },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  className,
}: StatCardProps) {
  const styles = toneStyles[tone];
  return (
    <Card className={cn('border-slate-200', className)}>
      <CardContent className="flex h-full items-start justify-between gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="break-words font-mono text-xl font-semibold leading-tight tabular-nums text-slate-900 2xl:text-2xl">
            {value}
          </p>
          {hint ? (
            <div className="mt-auto pt-1 text-xs leading-snug text-slate-500">{hint}</div>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
              styles.bg,
            )}
          >
            <Icon className={cn('h-4 w-4', styles.icon)} aria-hidden="true" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
