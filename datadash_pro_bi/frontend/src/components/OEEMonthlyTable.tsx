import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';

interface OoeMensualRow {
  periodo: string;
  horas_productivas: number;
  horas_totales: number;
  ooe: number;
}
interface Props { data: OoeMensualRow[]; meta?: number; }

function ooeColor(v: number, meta: number) {
  if (v >= meta)           return { fg: '#10b981', bg: 'rgba(16,185,129,.12)' };
  if (v >= meta - 10)      return { fg: '#f59e0b', bg: 'rgba(245,158,11,.12)' };
  return                          { fg: '#ef4444', bg: 'rgba(239,68,68,.12)' };
}

function label(periodo: string) {
  const [yy, mm] = periodo.split('-');
  const y = Number(yy), m = Number(mm);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return periodo;
  return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
}

const CustomDot = (props: { cx?: number; cy?: number; payload?: OoeMensualRow; meta?: number }) => {
  const { cx = 0, cy = 0, payload, meta = 85 } = props;
  if (!payload) return null;
  const c = ooeColor(payload.ooe, meta);
  return <circle cx={cx} cy={cy} r={5} fill={c.fg} stroke="#fff" strokeWidth={2} />;
};

export default function OOEMonthlyTable({ data, meta = 85 }: Props) {
  const [view, setView] = useState<'grafico' | 'tabla'>('grafico');

  const sorted = useMemo(() => [...data].sort((a, b) => a.periodo.localeCompare(b.periodo)), [data]);

  if (!data.length) return (
    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
      No hay fechas válidas para calcular OOE mensual.
    </p>
  );

  const avg = sorted.reduce((s, r) => s + r.ooe, 0) / sorted.length;
  const max = Math.max(...sorted.map(r => r.ooe));
  const min = Math.min(...sorted.map(r => r.ooe));

  return (
    <div>
      {/* Resumen rápido */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem', marginBottom: '1rem' }}>
        {[
          { l: 'Promedio', v: avg, suffix: '%' },
          { l: 'Máximo', v: max, suffix: '%' },
          { l: 'Mínimo', v: min, suffix: '%' },
        ].map(({ l, v, suffix }) => {
          const c = ooeColor(v, meta);
          return (
            <div key={l} style={{ background: c.bg, border: `1px solid ${c.fg}30`, borderRadius: 12, padding: '0.7rem 0.85rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: c.fg, letterSpacing: '-0.02em' }}>
                {v.toFixed(1)}{suffix}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem' }}>
        {(['grafico', 'tabla'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              border: '1px solid',
              borderColor: view === v ? 'var(--accent)' : 'var(--border)',
              background: view === v ? 'var(--accent-subtle)' : 'transparent',
              color: view === v ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all .15s',
            }}
          >
            {v === 'grafico' ? 'Gráfico' : 'Tabla'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
          Meta: <strong style={{ color: 'var(--text)' }}>{meta}%</strong>
        </span>
      </div>

      {/* Vista gráfico */}
      {view === 'grafico' && (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sorted} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="ooeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="periodo" tickFormatter={label} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                formatter={(v: number, _: string, p: { payload?: OoeMensualRow }) => {
                  const row = p?.payload;
                  return [`${v.toFixed(2)}% (${row?.horas_productivas.toFixed(1)}h / ${row?.horas_totales.toFixed(1)}h)`, 'OOE'];
                }}
                labelFormatter={label}
              />
              <ReferenceLine y={meta} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5}
                label={{ value: `Meta ${meta}%`, fill: '#f59e0b', fontSize: 10, position: 'right' }} />
              <Area type="monotone" dataKey="ooe" stroke="var(--accent)" strokeWidth={2}
                fill="url(#ooeGrad)"
                dot={<CustomDot meta={meta} />}
                activeDot={{ r: 7, fill: 'var(--accent)', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Vista tabla */}
      {view === 'tabla' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                {['Período', 'H. productivas', 'H. totales', 'OOE', 'Estado'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Período' ? 'left' : 'right',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: 'var(--text-muted)',
                    borderBottom: '2px solid var(--border-strong)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const c = ooeColor(row.ooe, meta);
                return (
                  <tr key={row.periodo} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,.02)' }}>
                    <td style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>
                      {label(row.periodo)}
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {row.horas_productivas.toLocaleString('es-CO', { maximumFractionDigits: 1 })} h
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {row.horas_totales.toLocaleString('es-CO', { maximumFractionDigits: 1 })} h
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 700, color: c.fg }}>
                      {row.ooe.toFixed(2)}%
                    </td>
                    <td style={{ padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.fg }}>
                        {row.ooe >= meta ? 'En meta' : row.ooe >= meta - 10 ? 'Riesgo' : 'Bajo'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
