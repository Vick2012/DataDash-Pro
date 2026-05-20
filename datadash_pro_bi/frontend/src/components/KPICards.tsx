import { useMemo } from 'react';

interface Props {
  resumen: {
    total_horas: number;
    total_produccion: number;
    total_ordenes: number;
    total_funcionarios: number;
    total_maquinas: number;
    ooe_global: number; // campo del backend Rust — no cambiar
  };
}

function oeeColor(v: number) {
  if (v >= 85) return { fg: '#10b981', bg: 'rgba(16,185,129,.1)', label: 'En meta' };
  if (v >= 70) return { fg: '#f59e0b', bg: 'rgba(245,158,11,.1)', label: 'Riesgo' };
  return { fg: '#ef4444', bg: 'rgba(239,68,68,.1)', label: 'Bajo' };
}

const icons = {
  horas: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 6v6l4 2"/>
    </svg>
  ),
  produccion: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
      <path strokeLinecap="round" d="M6 12h.01M10 12h.01M14 12h.01"/>
    </svg>
  ),
  ordenes: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      <path strokeLinecap="round" d="M9 12h6M9 16h4"/>
    </svg>
  ),
  funcionarios: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path strokeLinecap="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  maquinas: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path strokeLinecap="round" d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M12 12v4M10 14h4"/>
    </svg>
  ),
  oee: (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
    </svg>
  ),
};

export default function KPICards({ resumen }: Props) {
  // Fallback a 0 por si el backend envía undefined en algún campo
  const oee = resumen.ooe_global ?? 0;
  const oeeStyle = oeeColor(oee);

  const items = useMemo(() => [
    {
      key: 'horas',
      label: 'Total horas',
      value: (resumen.total_horas ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 1 }),
      unit: 'h',
      icon: icons.horas,
      accent: 'var(--accent)',
      accentBg: 'var(--accent-subtle)',
      sub: 'Horas registradas',
    },
    {
      key: 'produccion',
      label: 'Producción',
      value: (resumen.total_produccion ?? 0).toLocaleString('es-CO'),
      unit: '',
      icon: icons.produccion,
      accent: '#8b5cf6',
      accentBg: 'rgba(139,92,246,.1)',
      sub: 'Unidades producidas',
    },
    {
      key: 'ordenes',
      label: 'Órdenes',
      value: (resumen.total_ordenes ?? 0).toLocaleString('es-CO'),
      unit: '',
      icon: icons.ordenes,
      accent: '#0ea5e9',
      accentBg: 'rgba(14,165,233,.1)',
      sub: 'Órdenes de producción',
    },
    {
      key: 'funcionarios',
      label: 'Funcionarios',
      value: (resumen.total_funcionarios ?? 0).toLocaleString('es-CO'),
      unit: '',
      icon: icons.funcionarios,
      accent: '#f59e0b',
      accentBg: 'rgba(245,158,11,.1)',
      sub: 'Personal activo',
    },
    {
      key: 'maquinas',
      label: 'Máquinas',
      value: (resumen.total_maquinas ?? 0).toLocaleString('es-CO'),
      unit: '',
      icon: icons.maquinas,
      accent: '#ec4899',
      accentBg: 'rgba(236,72,153,.1)',
      sub: 'Centros / equipos',
    },
  ], [resumen]);

  return (
    <div style={{
      display: 'grid', gap: '0.65rem',
      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 10rem), 1fr))',
    }}>
      {/* Tarjetas KPI estándar */}
      {items.map(({ key, label, value, unit, icon, accent, accentBg, sub }) => (
        <div key={key} style={{
          background: 'var(--bg-card)', borderRadius: '16px',
          padding: '1rem 1.1rem', border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              {label}
            </span>
            <span style={{ width: 34, height: 34, borderRadius: '10px', background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0 }}>
              {icon}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1.1 }}>
              {value}
            </span>
            {unit && (
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: '0.2rem' }}>
                {unit}
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</span>
        </div>
      ))}

      {/* Tarjeta OEE especial con gauge */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px',
        padding: '1rem 1.1rem',
        border: `1px solid ${oeeStyle.fg}40`,
        boxShadow: `0 0 0 1px ${oeeStyle.fg}20, var(--shadow-sm)`,
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            OEE global
          </span>
          <span style={{ width: 34, height: 34, borderRadius: '10px', background: oeeStyle.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: oeeStyle.fg, flexShrink: 0 }}>
            {icons.oee}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.03em', color: oeeStyle.fg, lineHeight: 1.1 }}>
            {oee.toFixed(1)}
          </span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: oeeStyle.fg }}>%</span>
        </div>

        {/* Barra de progreso */}
        <div style={{ height: 5, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.min(100, oee)}%`,
            background: oeeStyle.fg, borderRadius: 999, transition: 'width 0.8s ease',
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Eficiencia productiva</span>
          <span style={{
            fontSize: '0.68rem', fontWeight: 600, padding: '2px 7px',
            borderRadius: 4, background: oeeStyle.bg, color: oeeStyle.fg,
          }}>
            {oeeStyle.label}
          </span>
        </div>
      </div>
    </div>
  );
}
