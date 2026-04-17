'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const SUB_NAV: Array<{ href: string; label: string }> = [
  { href: '/pengaturan/profil', label: 'Profil' },
  { href: '/pengaturan/tahun-ajaran', label: 'Tahun Ajaran' },
  { href: '/pengaturan/pengguna', label: 'Pengguna' },
  { href: '/pengaturan/sistem', label: 'Sistem' },
];

export default function PengaturanLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside>
        <nav aria-label="Pengaturan" className="space-y-1">
          {SUB_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
