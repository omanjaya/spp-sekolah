'use client';

import { FormEvent, useRef } from 'react';
import { LogOut, Search, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const initials = initialsFromName(user?.nama);
  const inputRef = useRef<HTMLInputElement>(null);

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    BENDAHARA: 'Bendahara',
    TU: 'TU',
    VIEWER: 'Viewer',
  };

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = inputRef.current?.value.trim();
    if (!query) return;
    router.push(`/siswa?search=${encodeURIComponent(query)}`);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
      <div className="flex flex-1 items-center gap-3 pl-10 lg:pl-0">
        <form onSubmit={handleSearch} role="search" className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            type="search"
            placeholder="Cari siswa / NIS"
            className="pl-9"
            aria-label="Cari siswa atau NIS"
          />
        </form>
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
