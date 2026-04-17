import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-white">
          <FileQuestion className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900">
          Halaman tidak ditemukan
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          URL yang Anda tuju tidak tersedia atau telah dipindahkan.
        </p>
        <Button asChild>
          <Link href="/">Kembali ke Ringkasan</Link>
        </Button>
      </div>
    </main>
  );
}
