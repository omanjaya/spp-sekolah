'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileBarChart, History, Inbox, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layouts/page-header';
import { cn } from '@/lib/utils';

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const TABS: TabItem[] = [
  { label: 'Tunggakan', href: '/laporan/tunggakan', icon: TriangleAlert },
  { label: 'Pemasukan', href: '/laporan/pemasukan', icon: FileBarChart },
  { label: 'Riwayat Import', href: '/laporan/import-batches', icon: Inbox },
  { label: 'Audit Log', href: '/laporan/audit', icon: ShieldCheck },
];

export default function LaporanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan"
        description="Ringkasan tunggakan, pemasukan, riwayat import, dan audit trail."
      />

      <div className="overflow-x-auto">
        <nav
          aria-label="Navigasi laporan"
          className="inline-flex min-w-full items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
          <span className="ml-auto pr-2 text-xs text-slate-400">
            <History className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Diperbarui real-time
          </span>
        </nav>
      </div>

      <div>{children}</div>
    </div>
  );
}
