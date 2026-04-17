'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowUpCircle,
  Award,
  CheckCircle2,
  Clipboard,
  CreditCard,
  Download,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
  Menu,
  PencilLine,
  Receipt,
  School,
  Settings,
  Table2,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/http';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

interface TahunAjaranLite {
  id: string;
  kode: string;
  isActive: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavItem[];
}

const NAV: NavItem[] = [
  { label: 'Ringkasan', href: '/', icon: LayoutDashboard },
  { label: 'Data Siswa', href: '/siswa', icon: Users },
  { label: 'Rombel', href: '/rombel', icon: School },
  { label: 'Naik Kelas', href: '/naik-kelas', icon: ArrowUpCircle },
  {
    label: 'Pembayaran',
    href: '/pembayaran/manual',
    icon: CreditCard,
    children: [
      { label: 'Paste Data', href: '/pembayaran/paste', icon: Clipboard },
      { label: 'Input Manual', href: '/pembayaran/manual', icon: PencilLine },
    ],
  },
  {
    label: 'Rekonsiliasi',
    href: '/rekonsiliasi',
    icon: Receipt,
    children: [
      { label: 'Data Transaksi', href: '/rekonsiliasi', icon: Table2 },
      { label: 'Import Excel', href: '/rekonsiliasi/import', icon: Upload },
    ],
  },
  { label: 'Keringanan', href: '/keringanan', icon: Award },
  { label: 'Pelunasan', href: '/pelunasan', icon: CheckCircle2 },
  { label: 'Ekspor', href: '/ekspor', icon: Download },
  { label: 'Laporan', href: '/laporan', icon: FileBarChart },
  { label: 'Pengaturan', href: '/pengaturan', icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
            {item.children && active ? (
              <ul className="ml-6 mt-1 space-y-1 border-l border-slate-200 pl-3">
                {item.children.map((child) => {
                  const childActive = pathname === child.href;
                  const ChildIcon = child.icon;
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        aria-current={childActive ? 'page' : undefined}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                          childActive
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                        )}
                      >
                        <ChildIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{child.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBrand() {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white">
        <GraduationCap className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-slate-900">SMAN 1 Denpasar</span>
        <span className="truncate text-xs text-slate-500">Sistem Pembayaran SPP</span>
      </div>
    </div>
  );
}

function TahunAjaranFooter({
  activeTahun,
  isLoading,
  isError,
}: {
  activeTahun?: TahunAjaranLite | null;
  isLoading: boolean;
  isError: boolean;
}) {
  const label = isLoading
    ? 'Memuat...'
    : isError
      ? 'Gagal memuat'
      : (activeTahun?.kode ?? 'Belum diset');

  return (
    <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-500">
      <p className="font-medium text-slate-700">Tahun Ajaran</p>
      <p className={cn('font-mono', isError && 'text-red-500')}>{label}</p>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const {
    data: activeTahun,
    isLoading: tahunLoading,
    isError: tahunError,
  } = useQuery<TahunAjaranLite | null>({
    queryKey: ['tahun-ajaran', 'active'],
    queryFn: async () => {
      const items = await apiFetch<TahunAjaranLite[]>('/api/v1/tahun-ajaran', {
        searchParams: { isActive: 'true' },
      });
      return items[0] ?? null;
    },
    staleTime: 5 * 60_000,
  });

  return (
    <>
      {/* Mobile hamburger — visible only below lg */}
      <div className="fixed left-4 top-3.5 z-40 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Buka menu navigasi">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-64 flex-col p-0">
            <SidebarBrand />
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigasi utama">
              <NavList pathname={pathname} />
            </nav>
            <TahunAjaranFooter
              activeTahun={activeTahun}
              isLoading={tahunLoading}
              isError={tahunError}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar — hidden below lg */}
      <aside
        aria-label="Navigasi utama"
        className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex"
      >
        <SidebarBrand />

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavList pathname={pathname} />
        </nav>

        <TahunAjaranFooter
          activeTahun={activeTahun}
          isLoading={tahunLoading}
          isError={tahunError}
        />
      </aside>
    </>
  );
}
