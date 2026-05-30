import { useMemo } from 'react';

interface Resumen {
  total_horas: number;
  total_produccion: number;
  total_ordenes: number;
  total_funcionarios: number;
  total_maquinas: number;
  ooe_global: number;
}

interface Props {
  resumen: Resumen;
  resumenGlobal?: Resumen;
  metaOee?: number;
}

function oeeColor(v: number, meta: number) {
  if (v >= meta)      return { fg: '#10b981', bg: 'rgba(16,185,129,.1)', label: 'En meta' };
  if (v >= meta - 10) return { fg: '#f59e0b', bg: 'rgba(245,158,11,.1)', label: 'Riesgo' };
  return                     { fg: '#ef4444', bg: 'rgba(239,68,68,.1)',   label: 'Bajo' };
}

const InfoTip = ({ text }: { text: string }) => (
  <span className="kpi-tip" tabIndex={0} aria-label={text}>
    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
    </svg>
    <span className="kpi-tip__text" role="tooltip">{text}</span>
  </span>
);

const PctChip = ({ pct, positive }: { pct: number; positive: boolean }) => (
  <span style={{
    fontSize: '0.62rem', fontWeight: 700,
    color: positive ? '#10b981' : '#ef4444',
    background: positive ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
    padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap',
  }}>
    {positive ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}% vs. global
  </span>
);

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

const TIPS: Record<string, string> = {
  horas:        'Suma de horas registradas en el período cargado',
  produccion:   'Total de unidades producidas (campo "cantidad" del archivo)',
  ordenes:      'Número de órdenes de producción únicas (OP)',
  funcionarios: 'Personal activo con registros en el período',
  maquinas:     'Equipos / centros de máquina con actividad registrada',
  oee:          'Overall Equipment Effectiveness — horas productivas / horas totales × 100',
};

export default function KPICards({ resumen, resumenGlobal, metaOee = 85 }: Props) {
  const oee      = resumen.ooe_global ?? 0;
  const oeeStyle = oeeColor(oee, metaOee);

  const globalOee = resumenGlobal?.ooe_global ?? null;
  const oeeDelta  = globalOee !== null ? oee - globalOee : null;

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
      raw: resumen.total_horas ?? 0,
      globalRaw: resumenGlobal?.total_horas ?? null,
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
      raw: resumen.total_produccion ?? 0,
      globalRaw: resumenGlobal?.total_produccion ?? null,
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
      raw: resumen.total_ordenes ?? 0,
      globalRaw: resumenGlobal?.total_ordenes ?? null,
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
      raw: resumen.total_funcionarios ?? 0,
      globalRaw: resumenGlobal?.total_funcionarios ?? null,
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
      raw: resumen.total_maquinas ?? 0,
      globalRaw: resumenGlobal?.total_maquinas ?? null,
    },
  ], [resumen, resumenGlobal]);

  return (
    <div style={{
      display: 'grid', gap: '0.65rem',
      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 10rem), 1fr))',
    }}>
      {items.map(({ key, label, value, unit, icon, accent, accentBg, sub, raw, globalRaw }) => {
        const pct = (globalRaw !== null && globalRaw > 0)
          ? ((raw / globalRaw) * 100 - 100)
          : null;
        const showChip = pct !== null && resumenGlobal !== undefined;

        return (
          <div key={key} style={{
            background: 'var(--bg-card)', borderRadius: '16px',
            padding: '1rem 1.1rem', border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                {label}
                <InfoTip text={TIPS[key] ?? ''} />
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</span>
              {showChip && <PctChip pct={pct!} positive={pct! >= 0} />}
            </div>
          </div>
        );
      })}

      {/* Tarjeta OEE especial con gauge */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px',
        padding: '1rem 1.1rem',
        border: `1px solid ${oeeStyle.fg}40`,
        boxShadow: `0 0 0 1px ${oeeStyle.fg}20, var(--shadow-sm)`,
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            OEE global
            <InfoTip text={TIPS.oee} />
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

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Meta: {metaOee}%
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {oeeDelta !== null && resumenGlobal !== undefined && (
              <PctChip pct={oeeDelta} positive={oeeDelta >= 0} />
            )}
            <span style={{
              fontSize: '0.68rem', fontWeight: 600, padding: '2px 7px',
              borderRadius: 4, background: oeeStyle.bg, color: oeeStyle.fg,
            }}>
              {oeeStyle.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
