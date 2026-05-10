import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Item {
  maquina: string;
  horas: number;
}

interface Props {
  data: Item[];
}

export default function ProductionChart({ data }: Props) {
  const safeData = Array.isArray(data) ? data : [];
  if (!safeData.length) return <p style={{ color: 'var(--text-muted)' }}>Sin datos</p>;

  const [topN, setTopN] = useState(10);
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [mode, setMode] = useState<'horas' | 'pct'>('horas');

  const chartData = useMemo(() => {
    const total = safeData.reduce((acc, it) => acc + (it.horas || 0), 0);
    const normalized = safeData.map((it) => ({
      maquina: it.maquina,
      horas: it.horas,
      pct: total > 0 ? (it.horas / total) * 100 : 0,
    }));
    const sorted = [...normalized].sort((a, b) => (order === 'desc' ? b.horas - a.horas : a.horas - b.horas));
    return sorted.slice(0, topN);
  }, [safeData, topN, order]);

  const valueKey = mode === 'horas' ? 'horas' : 'pct';
  const chartHeight = Math.min(520, 120 + chartData.length * 34);

  return (
    <div>
      <div className="chart-controls">
        <label>
          Top:
          <select value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
          </select>
        </label>
        <label>
          Orden:
          <select value={order} onChange={(e) => setOrder(e.target.value as 'desc' | 'asc')}>
            <option value="desc">Mayor a menor</option>
            <option value="asc">Menor a mayor</option>
          </select>
        </label>
        <label>
          Vista:
          <select value={mode} onChange={(e) => setMode(e.target.value as 'horas' | 'pct')}>
            <option value="horas">Horas</option>
            <option value="pct">% participación</option>
          </select>
        </label>
      </div>

      <div style={{ height: chartHeight }} className="chart-scroll-x">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 6, right: 16, left: 4, bottom: 6 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal />
            <XAxis
              type="number"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(v) => (mode === 'horas' ? `${v}` : `${v}`)}
            />
            <YAxis
              type="category"
              dataKey="maquina"
              width={148}
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              tickFormatter={(v) => (v?.length > 22 ? v.slice(0, 22) + '…' : v)}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [
                mode === 'horas'
                  ? `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`
                  : `${Number(value).toFixed(2)} %`,
                mode === 'horas' ? 'Horas' : 'Participación',
              ]}
              labelFormatter={(label) => `Centro: ${label}`}
            />
            <Bar dataKey={valueKey} fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
