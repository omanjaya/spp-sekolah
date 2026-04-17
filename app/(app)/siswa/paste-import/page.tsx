'use client';

import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useBulkImportSiswa } from '@/hooks/use-siswa';
import { HttpError } from '@/lib/http';
import type { BulkResult } from '@/types/domain';
import type { SiswaBulkImportItem } from '@/lib/validators/siswa.schema';

interface ParsedRow extends SiswaBulkImportItem {
  _error?: string;
  _line: number;
}

const TEMPLATE = `NIS\tNama\tAngkatan\tGender\tAlamat\tKontakOrtu
2023001\tBudi Santoso\t2023\tL\tJl. Melati 5\t08123456789
2023002\tSari Dewi\t2023\tP\tJl. Mawar 2\t08123456790`;

function parseLine(line: string, index: number): ParsedRow | null {
  const cols = line.split(/\t|;|,/).map((c) => c.trim());
  if (cols.length === 0 || cols.every((c) => c === '')) return null;

  const [nisRaw, namaRaw, angkatanRaw, genderRaw, alamatRaw, kontakRaw] = cols;
  const row: ParsedRow = {
    _line: index + 1,
    nis: nisRaw ?? '',
    nama: namaRaw ?? '',
    angkatan: 0,
    jenisKelamin: null,
    alamat: alamatRaw ?? null,
    kontakOrtu: kontakRaw ?? null,
  };

  if (!row.nis) row._error = 'NIS kosong.';
  else if (!row.nama) row._error = 'Nama kosong.';
  else {
    const angkatanNum = Number((angkatanRaw ?? '').replace(/\D/g, ''));
    if (!Number.isFinite(angkatanNum) || angkatanNum < 1990 || angkatanNum > 2100) {
      row._error = 'Angkatan tidak valid.';
    } else {
      row.angkatan = angkatanNum;
    }
  }

  if (genderRaw) {
    const g = genderRaw.toUpperCase();
    if (g === 'L' || g === 'LAKI-LAKI' || g === 'LAKI') row.jenisKelamin = 'L';
    else if (g === 'P' || g === 'PEREMPUAN') row.jenisKelamin = 'P';
  }

  return row;
}

export default function SiswaPasteImportPage() {
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const bulkImport = useBulkImportSiswa();

  const rows = useMemo<ParsedRow[]>(() => {
    if (!raw.trim()) return [];
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const parsed: ParsedRow[] = [];
    // Skip header row jika detect kata kunci.
    const startIdx =
      lines[0] && /nis/i.test(lines[0]) && /nama/i.test(lines[0]) ? 1 : 0;
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const r = parseLine(line, i);
      if (r) parsed.push(r);
    }
    return parsed;
  }, [raw]);

  const validRows = rows.filter((r) => !r._error);
  const invalidRows = rows.filter((r) => r._error);

  async function handleSubmit() {
    if (validRows.length === 0) {
      toast.error('Tidak ada baris valid untuk diimpor.');
      return;
    }
    try {
      const res = await bulkImport.mutateAsync({
        items: validRows.map((r) => ({
          nis: r.nis,
          nama: r.nama,
          angkatan: r.angkatan,
          jenisKelamin: r.jenisKelamin ?? null,
          alamat: r.alamat ?? null,
          kontakOrtu: r.kontakOrtu ?? null,
        })),
      });
      setResult(res);
      toast.success(`${res.created + res.updated} siswa berhasil diimpor.`);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengimpor siswa.';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Siswa (Paste)"
        description="Tempel data siswa dari spreadsheet. Kolom: NIS, Nama, Angkatan, Gender, Alamat, KontakOrtu."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tempel data</CardTitle>
          <CardDescription>
            Pisahkan kolom dengan tab. Baris pertama boleh header.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={10}
            placeholder={TEMPLATE}
            className="font-mono text-xs"
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {rows.length === 0
                ? 'Belum ada baris.'
                : `${rows.length} baris terdeteksi — ${validRows.length} valid, ${invalidRows.length} invalid`}
            </div>
            <Button
              onClick={() => void handleSubmit()}
              disabled={bulkImport.isPending || validRows.length === 0}
            >
              {bulkImport.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Import {validRows.length} siswa
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>
              Baris bermasalah ditandai merah dan tidak akan diimpor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">NIS</th>
                    <th className="px-2 py-2">Nama</th>
                    <th className="px-2 py-2">Angkatan</th>
                    <th className="px-2 py-2">Gender</th>
                    <th className="px-2 py-2">Alamat</th>
                    <th className="px-2 py-2">Kontak</th>
                    <th className="px-2 py-2">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr
                      key={`${idx}-${r.nis}`}
                      className={r._error ? 'bg-red-50' : undefined}
                    >
                      <td className="px-2 py-1 text-slate-400">{idx + 1}</td>
                      <td className="px-2 py-1 font-mono">{r.nis}</td>
                      <td className="px-2 py-1">{r.nama}</td>
                      <td className="px-2 py-1 font-mono">{r.angkatan || '—'}</td>
                      <td className="px-2 py-1">{r.jenisKelamin ?? '—'}</td>
                      <td className="px-2 py-1">{r.alamat ?? '—'}</td>
                      <td className="px-2 py-1">{r.kontakOrtu ?? '—'}</td>
                      <td className="px-2 py-1 text-destructive">{r._error ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Hasil Import
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-slate-700 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500">Total</div>
              <div className="font-semibold">{result.total}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Dibuat</div>
              <div className="font-semibold text-emerald-600">{result.created}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Diupdate</div>
              <div className="font-semibold text-slate-900">{result.updated}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Dilewati</div>
              <div className="font-semibold text-amber-600">{result.skipped}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
