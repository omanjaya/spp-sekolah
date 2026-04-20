'use client'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Halaman ini mengalami error</h2>
        <p className="text-sm text-slate-600">Coba muat ulang halaman. Jika masalah berlanjut, hubungi administrator.</p>
        {error.digest && <p className="font-mono text-xs text-slate-400">Error ID: {error.digest}</p>}
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => window.location.href = '/'}>Ke Beranda</Button>
          <Button onClick={reset}>Muat Ulang</Button>
        </div>
      </div>
    </div>
  )
}
