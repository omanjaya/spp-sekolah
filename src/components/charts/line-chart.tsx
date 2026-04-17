'use client';

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';

/**
 * Responsive line chart wrapper for report pages.
 *
 * Keeps styling in one place so /page.tsx and laporan/pemasukan share the
 * same look. X-axis displays `xKey` label (caller controls formatting);
 * Y-axis renders compact Rupiah (100k, 1M).
 */

export interface LineChartDatum {
  [key: string]: string | number | null | undefined;
}

interface LineChartProps<T extends LineChartDatum> {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  height?: number;
  ariaLabel?: string;
  yFormatter?: (value: number) => string;
  tooltipLabelFormatter?: (value: string | number, payload: unknown) => string;
  stroke?: string;
}

const rupiahCompactFormatter = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const rupiahFullFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function defaultYFormatter(value: number): string {
  if (value === 0) return '0';
  return `Rp ${rupiahCompactFormatter.format(value)}`;
}

function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: TooltipProps<number, string> & {
  labelFormatter?: (value: string | number, payload: unknown) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0];
  if (!first) return null;
  const numericValue = typeof first.value === 'number' ? first.value : Number(first.value ?? 0);
  const headerLabel = labelFormatter ? labelFormatter(label ?? '', payload) : String(label ?? '');
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-slate-900">{headerLabel}</div>
      <div className="mt-1 font-mono tabular-nums text-slate-700">
        {rupiahFullFormatter.format(numericValue)}
      </div>
    </div>
  );
}

export function LineChart<T extends LineChartDatum>({
  data,
  xKey,
  yKey,
  height = 260,
  ariaLabel = 'Grafik pemasukan',
  yFormatter,
  tooltipLabelFormatter,
  stroke = '#0f172a',
}: LineChartProps<T>) {
  const formatter = yFormatter ?? defaultYFormatter;
  return (
    <div style={{ width: '100%', height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey={xKey}
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatter}
            width={70}
          />
          <Tooltip
            cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
            content={(props) => (
              <ChartTooltip {...(props as TooltipProps<number, string>)} labelFormatter={tooltipLabelFormatter} />
            )}
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={stroke}
            strokeWidth={2}
            dot={{ r: 3, fill: stroke }}
            activeDot={{ r: 5 }}
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
