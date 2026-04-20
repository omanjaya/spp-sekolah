'use client';

import { LogOut, Search, User } from 'lucide-react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { useCommandStore } from '@/store/command-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

function initialsFromName(name: string | null | undefined): string {
  if (!name) return 'US';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'US';
}

export function Topbar() {
  const { data: session } = useSession();
  const user = session?.user;
  const initials = initialsFromName(user?.nama);
  const { setOpen } = useCommandStore();

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    BENDAHARA: 'Bendahara',
    TU: 'TU',
    VIEWER: 'Viewer',
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
      <div className="flex flex-1 items-center gap-3 pl-10 lg:pl-0">
        <button
          onClick={() => setOpen(true)}
          className="relative flex w-full max-w-sm items-center rounded-md border border-input bg-transparent px-3 py-1.5 text-sm text-slate-400 shadow-sm hover:bg-slate-50"
          aria-label="Buka pencarian (Cmd+K)"
          type="button"
        >
          <Search className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Cari...</span>
          <kbd className="ml-auto hidden rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 lg:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Menu akun">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="space-y-0.5">
            <div className="text-sm font-medium">{user?.nama ?? 'Pengguna'}</div>
            <div className="text-xs text-slate-500">
              {user?.email ?? '—'}
              {user?.role ? <span className="ml-1">· {roleLabel[user.role] ?? 'Pengguna'}</span> : null}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/pengaturan/profil">
              <User className="h-4 w-4" aria-hidden="true" />
              Profil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut({ callbackUrl: '/login' })}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
