'use client';

import { FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ExcelUploaderProps {
  file: File | null;
  onChange: (file: File | null) => void;
  maxBytes?: number;
  disabled?: boolean;
  className?: string;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.xlsx,.xls';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function validateFile(file: File, maxBytes: number): string | null {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
    return 'Hanya menerima file .xlsx atau .xls.';
  }
  if (file.size > maxBytes) {
    return `Ukuran file melebihi batas (${formatBytes(maxBytes)}).`;
  }
  if (file.size === 0) return 'File kosong.';
  return null;
}

export function ExcelUploader({
  file,
  onChange,
  maxBytes = DEFAULT_MAX_BYTES,
  disabled,
  className,
}: ExcelUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(
    (f: File | null) => {
      if (!f) {
        onChange(null);
        setError(null);
        return;
      }
      const err = validateFile(f, maxBytes);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      onChange(f);
    },
    [onChange, maxBytes],
  );

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (disabled) return;
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (disabled) return;
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          const f = e.dataTransfer.files?.[0] ?? null;
          pick(f);
        }}
        className={cn(
          'relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-white px-6 py-10 text-center transition-colors',
          isDragging
            ? 'border-slate-900 bg-slate-50'
            : 'border-slate-300 hover:border-slate-400',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          disabled={disabled}
        />

        {file ? (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
              disabled={disabled}
              aria-label="Hapus file"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">
                Seret file Excel ke sini atau klik untuk memilih
              </p>
              <p className="text-xs text-slate-500">
                Terima .xlsx / .xls, maks {formatBytes(maxBytes)}.
              </p>
            </div>
          </>
        )}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
