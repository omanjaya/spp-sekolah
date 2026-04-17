'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Table2, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/rekonsiliasi', label: 'Data Transaksi', icon: Table2 },
  { href: '/rekonsiliasi/import', label: 'Import Excel', icon: Upload },
];

export default function RekonsiliasiLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-5">
      <nav className="flex gap-1 border-b border-slate-200" aria-label="Sub-navigasi Rekonsiliasi">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== '/rekonsiliasi' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div>{children}</div>
    </div>
  );
}
