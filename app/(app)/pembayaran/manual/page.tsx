'use client';

import { PencilLine } from 'lucide-react';

import { PageHeader } from '@/components/layouts/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PembayaranManualForm } from '@/components/forms/pembayaran-manual-form';

export default function ManualPembayaranPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Input Manual"
        description="Catat satu pembayaran secara manual (misal pembayaran tunai / offline)."
      />

      <Card className="max-w-2xl border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PencilLine className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Form Pembayaran Manual
          </CardTitle>
          <CardDescription>
            Sumber dicatat sebagai MANUAL. No. Bukti tidak wajib. Periode yang sama untuk siswa yang sama
            akan ditolak.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PembayaranManualForm />
        </CardContent>
      </Card>
    </div>
  );
}
