'use client';

import type { LucideIcon } from 'lucide-react';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActivityItem {
  id: string;
  icon?: LucideIcon;
  title: string;
  description?: string;
  timestamp: string; // ISO
  tone?: 'default' | 'success' | 'warning' | 'danger';
  meta?: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  emptyLabel?: string;
  className?: string;
}

const toneStyles: Record<NonNullable<ActivityItem['tone']>, string> = {
  default: 'text-slate-600 bg-slate-100',
  success: 'text-emerald-700 bg-emerald-50',
  warning: 'text-amber-700 bg-amber-50',
  danger: 'text-red-700 bg-red-50',
};

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFormatter.format(d);
}

export function ActivityFeed({ items, emptyLabel = 'Belum ada aktivitas.', className }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 px-1 py-3 text-sm text-slate-500', className)}>
        <Activity className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {emptyLabel}
      </div>
    );
  }
  return (
    <ul className={cn('divide-y divide-slate-100', className)}>
      {items.map((item) => {
        const Icon = item.icon ?? Activity;
        const toneClass = toneStyles[item.tone ?? 'default'];
        return (
          <li key={item.id} className="flex items-start gap-3 py-3">
            <div
              className={cn(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                toneClass,
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
              {item.description ? (
                <p className="truncate text-xs text-slate-500">{item.description}</p>
              ) : null}
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>{formatTimestamp(item.timestamp)}</span>
                {item.meta ? <span>· {item.meta}</span> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
