'use client';

import {
  Bar,
  CartesianGrid,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';

export interface BarChartDatum {
  [key: string]: string | number | null | undefined;
}

interface BarChartProps<T extends BarChartDatum> {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  height?: number;
  ariaLabel?: string;
  fill?: string;
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

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0];
  if (!first) return null;
  const value = typeof first.value === 'number' ? first.value : Number(first.value ?? 0);
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-slate-900">{String(label ?? '')}</div>
      <div className="mt-1 font-mono tabular-nums text-slate-700">
        {rupiahFullFormatter.format(value)}
      </div>
    </div>
  );
}

export function BarChart<T extends BarChartDatum>({
  data,
  xKey,
  yKey,
  height = 260,
  ariaLabel = 'Grafik batang',
  fill = '#0f172a',
}: BarChartProps<T>) {
  return (
    <div style={{ width: '100%', height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `Rp ${rupiahCompactFormatter.format(v)}`}
            width={70}
          />
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={(p) => <ChartTooltip {...(p as TooltipProps<number, string>)} />} />
          <Bar dataKey={yKey} fill={fill} radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
