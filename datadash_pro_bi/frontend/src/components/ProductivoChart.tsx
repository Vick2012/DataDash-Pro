import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

interface Item { tipo: string; horas: number; }
interface Props { data: Item[]; }

const PALETTE = [
  { color: '#10b981', bg: 'rgba(16,185,129,.12)' },  // productiva → verde
  { color: '#ef4444', bg: 'rgba(239,68,68,.12)' },    // improductiva → rojo
  { color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },   // alistamiento → ámbar
  { color: '#94a3b8', bg: 'rgba(148,163,184,.12)' },  // sin trabajo → gris
];

function getColor(tipo: string, idx: number) {
  const t = tipo.toLowerCase();
  if (t.includes('productiv') && !t.includes('im')) return PALETTE[0];
  if (t.includes('improductiv'))                      return PALETTE[1];
  if (t.includes('alistar') || t.includes('amiento')) return PALETTE[2];
  return PALETTE[idx % PALETTE.length];
}

const CenterLabel = ({ cx = 0, cy = 0, total = 0, label = '' }) => (
  <>
    <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 18, fontWeight: 700, fill: 'var(--text)' }}>
      {total.toFixed(0)}h
    </text>
    <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 10, fill: 'var(--text-muted)' }}>
      {label}
    </text>
  </>
);

export default function ProductivoChart({ data }: Props) {
  const safeData = Array.isArray(data) ? data : [];
  if (!safeData.length) return (
    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Sin datos (columna FILTRO)</p>
  );

  const [view, setView] = useState<'dona' | 'barras'>('dona');
  const [activeTipo, setActiveTipo] = useState<string | null>(null);

  const enriched = useMemo(() => {
    const total = safeData.reduce((s, it) => s + (it.horas || 0), 0);
    return safeData.map((it, i) => ({
      ...it,
      pct: total > 0 ? (it.horas / total) * 100 : 0,
      ...getColor(it.tipo, i),
    }));
  }, [safeData]);

  const total = useMemo(() => enriched.reduce((s, it) => s + it.horas, 0), [enriched]);
  const active = activeTipo ? enriched.find(e => e.tipo === activeTipo) : null;

  return (
    <div>
      {/* Toggles de vista */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
        {(['dona', 'barras'] as const).map(v => (
          <button key={v} type="button" onClick={() => setView(v)} style={{
            padding: '4px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            border: '1px solid', transition: 'all .15s',
            borderColor: view === v ? 'var(--accent)' : 'var(--border)',
            background: view === v ? 'var(--accent-subtle)' : 'transparent',
            color: view === v ? 'var(--accent)' : 'var(--text-muted)',
          }}>
            {v === 'dona' ? 'Dona' : 'Barras'}
          </button>
        ))}
      </div>

      {/* Leyenda / chips clickeables */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
        {enriched.map(it => (
          <button
            key={it.tipo}
            type="button"
            onClick={() => setActiveTipo(prev => prev === it.tipo ? null : it.tipo)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
              border: '1px solid',
              borderColor: activeTipo === it.tipo ? it.color : `${it.color}50`,
              background: activeTipo === it.tipo ? it.bg : 'transparent',
              color: activeTipo === it.tipo ? it.color : 'var(--text-secondary)',
              transition: 'all .15s',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
            {it.tipo}
          </button>
        ))}
      </div>

      {/* Dona */}
      {view === 'dona' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ height: 260, width: '100%', maxWidth: 320, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={enriched}
                  dataKey="horas"
                  nameKey="tipo"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={105}
                  paddingAngle={2}
                  stroke="none"
                >
                  {enriched.map((it) => (
                    <Cell
                      key={it.tipo}
                      fill={it.color}
                      opacity={activeTipo && activeTipo !== it.tipo ? 0.25 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                  formatter={(_v: number, _n: string, p: { payload?: typeof enriched[0] }) => {
                    const row = p?.payload;
                    return [`${row?.horas.toFixed(2)} h (${row?.pct.toFixed(1)}%)`, 'Horas'];
                  }}
                />
                {/* Centro con total o dato activo */}
                <CenterLabel
                  cx={160} cy={130}
                  total={active ? active.horas : total}
                  label={active ? `${active.pct.toFixed(1)}%` : 'Total'}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla de desglose bajo la dona */}
          <div style={{ width: '100%', marginTop: '0.5rem' }}>
            {enriched.map(it => (
              <div
                key={it.tipo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
                  borderBottom: '1px solid var(--border)',
                  opacity: activeTipo && activeTipo !== it.tipo ? 0.4 : 1,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 2, background: it.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{it.tipo}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' }}>
                  {it.horas.toFixed(1)} h
                </span>
                <span style={{ fontSize: '0.75rem', color: it.color, fontWeight: 600, minWidth: 44, textAlign: 'right' }}>
                  {it.pct.toFixed(1)}%
                </span>
                {/* mini-barra */}
                <div style={{ width: 52, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${it.pct}%`, height: '100%', background: it.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barras */}
      {view === 'barras' && (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enriched} margin={{ top: 10, right: 8, left: 8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="tipo" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                formatter={(_v: number, _n: string, p: { payload?: typeof enriched[0] }) => {
                  const row = p?.payload;
                  return [`${row?.horas.toFixed(2)} h (${row?.pct.toFixed(1)}%)`, 'Horas'];
                }}
              />
              <Bar dataKey="horas" radius={[6, 6, 0, 0]} barSize={44}>
                {enriched.map(it => (
                  <Cell
                    key={it.tipo}
                    fill={it.color}
                    opacity={activeTipo && activeTipo !== it.tipo ? 0.25 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
