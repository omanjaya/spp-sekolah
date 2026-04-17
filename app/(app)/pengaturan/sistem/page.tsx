'use client';

import { Loader2, UserCog } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { settingsToMap, useSettings, useUpdateSettings } from '@/hooks/use-settings';
import { HttpError } from '@/lib/http';
import { SETTING_KEYS, type SettingKey } from '@/lib/validators/setting.schema';

type SettingField = {
  key: SettingKey;
  label: string;
  hint?: string;
};

const FIELDS: SettingField[] = [
  { key: 'school.name', label: 'Nama Sekolah' },
  { key: 'school.address', label: 'Alamat Sekolah' },
  { key: 'school.npsn', label: 'NPSN' },
  { key: 'school.headmaster', label: 'Kepala Sekolah' },
  { key: 'pdf.header_title', label: 'Judul Header PDF', hint: 'Muncul di kop PDF matrix.' },
];

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

export default function SistemPage() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const [values, setValues] = useState<Record<SettingKey, string>>(() => {
    const init: Record<SettingKey, string> = {
      'school.name': '',
      'school.address': '',
      'school.npsn': '',
      'school.headmaster': '',
      'pdf.header_title': '',
    };
    return init;
  });

  useEffect(() => {
    if (data) {
      const map = settingsToMap(data);
      setValues({
        'school.name': asString(map['school.name']),
        'school.address': asString(map['school.address']),
        'school.npsn': asString(map['school.npsn']),
        'school.headmaster': asString(map['school.headmaster']),
        'pdf.header_title': asString(map['pdf.header_title']),
      });
    }
  }, [data]);

  async function handleSave() {
    try {
      await update.mutateAsync({
        items: SETTING_KEYS.map((k) => ({ key: k, value: values[k] ?? '' })),
      });
      toast.success('Pengaturan sistem disimpan.');
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal menyimpan pengaturan.';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sistem"
        description="Pengaturan kop sekolah dan header PDF."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identitas Sekolah</CardTitle>
          <CardDescription>Dipakai untuk kop surat dan ekspor PDF.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-slate-500">Memuat...</div>
          ) : (
            FIELDS.map((f) => (
              <FormFieldWrapper key={f.key} label={f.label} hint={f.hint}>
                <Input
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                />
              </FormFieldWrapper>
            ))
          )}
          <div className="flex justify-end">
            <Button onClick={() => void handleSave()} disabled={update.isPending || isLoading}>
              {update.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Simpan pengaturan
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enrollment</CardTitle>
          <CardDescription>
            Tetapkan siswa ke rombel dalam batch. Akan membuat/memindahkan enrollment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/rombel">
              <UserCog className="mr-2 h-4 w-4" aria-hidden="true" />
              Kelola Rombel &amp; Enrollment
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
