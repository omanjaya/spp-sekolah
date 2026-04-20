'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Award,
  CheckCircle2,
  Clipboard,
  CreditCard,
  Download,
  FileBarChart,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Lock,
  PencilLine,
  RotateCcw,
  School,
  Settings,
  Upload,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useCommandStore } from '@/store/command-store';

interface NavEntry {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavEntry[] = [
  { label: 'Ringkasan', href: '/', icon: LayoutDashboard },
  { label: 'Data Siswa', href: '/siswa', icon: Users },
  { label: 'Rombel', href: '/rombel', icon: School },
  { label: 'Input Manual', href: '/pembayaran/manual', icon: PencilLine },
  { label: 'Paste Data', href: '/pembayaran/paste', icon: Clipboard },
  { label: 'Import Excel', href: '/pembayaran/import', icon: Upload },
  { label: 'Keringanan', href: '/keringanan', icon: Award },
  { label: 'Pelunasan', href: '/pelunasan', icon: CheckCircle2 },
  { label: 'Refund', href: '/refund', icon: RotateCcw },
  { label: 'Kwitansi', href: '/kwitansi', icon: FileText },
  { label: 'Laporan Tunggakan', href: '/laporan/tunggakan', icon: FileBarChart },
  { label: 'Laporan Pemasukan', href: '/laporan/pemasukan', icon: FileBarChart },
  { label: 'Laporan Per Rombel', href: '/laporan/per-rombel', icon: GraduationCap },
  { label: 'Permintaan Cancel', href: '/cancel-request', icon: XCircle },
  { label: 'Kunci Periode', href: '/pengaturan/periode-lock', icon: Lock },
  { label: 'Backup Data', href: '/backup', icon: Archive },
  { label: 'Pengaturan', href: '/pengaturan', icon: Settings },
];

const QUICK_ACTIONS: NavEntry[] = [
  { label: 'Input Pembayaran Manual', href: '/pembayaran/manual', icon: CreditCard },
  { label: 'Import Excel BPD', href: '/pembayaran/import', icon: Upload },
  { label: 'Cetak Laporan Komite', href: '/ekspor', icon: Download },
];

export function CommandPalette() {
  const router = useRouter();
  const { open, setOpen } = useCommandStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, setOpen]);

  function handleSelect(href: string) {
    router.push(href);
    setOpen(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Ketik untuk mencari..." />
      <CommandList>
        <CommandEmpty>Tidak ada hasil.</CommandEmpty>
        <CommandGroup heading="Navigasi">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                value={item.label}
                onSelect={() => handleSelect(item.href)}
                className="cursor-pointer"
              >
                <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Aksi Cepat">
          {QUICK_ACTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={`quick-${item.href}`}
                value={`aksi ${item.label}`}
                onSelect={() => handleSelect(item.href)}
                className="cursor-pointer"
              >
                <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
