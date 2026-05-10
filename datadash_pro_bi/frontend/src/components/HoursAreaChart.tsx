import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Item {
  area: string;
  horas: number;
}

interface Props {
  data: Item[];
}

export default function HoursAreaChart({ data }: Props) {
  const safeData = Array.isArray(data) ? data : [];
  if (!safeData.length) return <p style={{ color: 'var(--text-muted)' }}>Sin datos</p>;

  const [topN, setTopN] = useState(8);
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');

  const chartData = useMemo(() => {
    const sorted = [...safeData].sort((a, b) => (order === 'desc' ? b.horas - a.horas : a.horas - b.horas));
    return sorted.slice(0, topN);
  }, [safeData, topN, order]);

  return (
    <div>
      <div className="chart-controls">
        <label>
          Top:
          <select value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
            <option value={5}>5</option>
            <option value={8}>8</option>
            <option value={12}>12</option>
          </select>
        </label>
        <label>
          Orden:
          <select value={order} onChange={(e) => setOrder(e.target.value as 'desc' | 'asc')}>
            <option value="desc">Mayor a menor</option>
            <option value="asc">Menor a mayor</option>
          </select>
        </label>
      </div>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={chartData} margin={{ top: 10, right: 8, left: 30, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="area"
              width={130}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(v) => (v?.length > 18 ? v.slice(0, 18) + '…' : v)}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [`${Number(value).toFixed(2)} h`, 'Horas']}
              labelFormatter={(value) => `Área: ${value}`}
            />
            <Bar dataKey="horas" fill="var(--success)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
