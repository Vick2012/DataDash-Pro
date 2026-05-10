import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface Item {
  tipo: string;
  horas: number;
}

interface Props {
  data: Item[];
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];

export default function ProductivoChart({ data }: Props) {
  const safeData = Array.isArray(data) ? data : [];
  if (!safeData.length) return <p style={{ color: 'var(--text-muted)' }}>Sin datos (columna FILTRO)</p>;

  const [activeTipo, setActiveTipo] = useState<string>('Todos');
  const [view, setView] = useState<'dona' | 'barras'>('dona');
  const [mode, setMode] = useState<'horas' | 'pct'>('pct');

  const chartData = useMemo(() => {
    const total = safeData.reduce((acc, it) => acc + (it.horas || 0), 0);
    const normalized = safeData.map((it) => ({
      tipo: it.tipo,
      horas: it.horas,
      pct: total > 0 ? (it.horas / total) * 100 : 0,
    }));
    if (activeTipo === 'Todos') return normalized;
    return normalized.filter((x) => x.tipo === activeTipo);
  }, [safeData, activeTipo]);

  const valueKey = mode === 'horas' ? 'horas' : 'pct';

  return (
    <div>
      <div className="chart-controls">
        <label>
          Vista:
          <select value={view} onChange={(e) => setView(e.target.value as 'dona' | 'barras')}>
            <option value="dona">Dona</option>
            <option value="barras">Barras</option>
          </select>
        </label>
        <label>
          Métrica:
          <select value={mode} onChange={(e) => setMode(e.target.value as 'horas' | 'pct')}>
            <option value="pct">% participación</option>
            <option value="horas">Horas</option>
          </select>
        </label>
      </div>

      <div className="chart-chip-row">
        <button
          type="button"
          className={`chart-chip ${activeTipo === 'Todos' ? 'chart-chip--active' : ''}`}
          onClick={() => setActiveTipo('Todos')}
        >
          Todos
        </button>
        {safeData.map((item, i) => (
          <button
            type="button"
            key={item.tipo}
            className={`chart-chip ${activeTipo === item.tipo ? 'chart-chip--active' : ''}`}
            onClick={() => setActiveTipo(item.tipo)}
            style={{ borderColor: COLORS[i % COLORS.length] }}
          >
            {item.tipo}
          </button>
        ))}
      </div>

      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          {view === 'dona' ? (
            <PieChart>
              <Pie
                data={chartData}
                dataKey={valueKey}
                nameKey="tipo"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={90}
                label={({ tipo, pct }) => `${tipo}: ${pct.toFixed(1)}%`}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                }}
                formatter={(value: number, _n, p: { payload?: { horas: number; pct: number } }) => {
                  const horas = p?.payload?.horas ?? 0;
                  const pct = p?.payload?.pct ?? 0;
                  return [`${horas.toFixed(2)} h (${pct.toFixed(2)}%)`, 'Uso'];
                }}
              />
            </PieChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 8, left: 8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="tipo" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                }}
                formatter={(value: number, _n, p: { payload?: { horas: number; pct: number } }) => {
                  const horas = p?.payload?.horas ?? 0;
                  const pct = p?.payload?.pct ?? 0;
                  return [mode === 'horas' ? `${horas.toFixed(2)} h` : `${pct.toFixed(2)}%`, 'Uso'];
                }}
              />
              <Bar dataKey={valueKey} fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
