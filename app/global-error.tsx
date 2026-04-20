'use client'
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-4 font-sans">
        <div className="max-w-md text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold text-slate-900">Terjadi Kesalahan</h1>
          <p className="text-sm text-slate-600">Sistem mengalami error tak terduga. Tim teknis telah diberitahu.</p>
          {error.digest && <p className="font-mono text-xs text-slate-400">ID: {error.digest}</p>}
          <button onClick={reset} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
            Coba Lagi
          </button>
        </div>
      </body>
    </html>
  )
}
