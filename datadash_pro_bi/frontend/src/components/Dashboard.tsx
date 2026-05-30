import { useEffect, useMemo, useState } from 'react';
import type { MetricsResponse } from '../types';
import { activeMetricsForCentro } from '../types';
import KPICards from './KPICards';
import ProductionChart from './ProductionChart';
import HoursAreaChart from './HoursAreaChart';
import EfficiencyTable from './EfficiencyTable';
import EficienciaMaquinaTable from './EficienciaMaquinaTable';
import ProductivoChart from './ProductivoChart';
import UsoMaquinasChart from './UsoMaquinasChart';
import OEEMonthlyTable from './OEEMonthlyTable';

interface Props {
  data: MetricsResponse;
  onReset: () => void;
  centroSeleccionado: string;
}

const defaultResumen = {
  total_horas: 0,
  total_produccion: 0,
  total_ordenes: 0,
  total_funcionarios: 0,
  total_maquinas: 0,
  ooe_global: 0,
};

const IconFile = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconTable = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
  </svg>
);
const IconRows = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const IconUpload = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);
const IconFilter = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
  </svg>
);

export default function Dashboard({ data, onReset, centroSeleccionado }: Props) {
  const m = activeMetricsForCentro(data, centroSeleccionado);
  const resumen                = m.resumen               ?? defaultResumen;
  const produccionMaquina      = m.produccion_maquina    ?? [];
  const horasArea              = m.horas_area            ?? [];
  const productivoImproductivo = m.productivo_improductivo ?? [];
  const usoMaquinas            = m.uso_maquinas          ?? [];
  const eficienciaFuncionarios = m.eficiencia_funcionarios ?? [];
  const eficienciaMaquina      = m.eficiencia_maquina    ?? [];
  // ooe_mensual: nombre del campo en el backend Rust — no cambiar
  const ooeMensual             = m.ooe_mensual           ?? [];
  const filtrado               = Boolean(centroSeleccionado.trim());

  const [metaOee,             setMetaOee]             = useState(85);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('');
  const [filtroMaquina,       setFiltroMaquina]       = useState('');
  const [filtroArea,          setFiltroArea]          = useState('');

  const periodosDisponibles = useMemo(
    () => ooeMensual.map((x) => x.periodo),
    [ooeMensual],
  );

  useEffect(() => {
    setFiltroMaquina('');
    setFiltroArea('');
  }, [centroSeleccionado]);

  const maquinasDisponibles = useMemo(() => {
    const names = new Set<string>();
    for (const row of [...produccionMaquina, ...usoMaquinas, ...eficienciaMaquina]) {
      const n = row.maquina?.trim();
      if (n) names.add(row.maquina);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [produccionMaquina, usoMaquinas, eficienciaMaquina]);

  const areasDisponibles = useMemo(() => {
    const names = new Set<string>();
    for (const row of horasArea) {
      const n = row.area?.trim();
      if (n) names.add(row.area);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [horasArea]);

  useEffect(() => {
    if (filtroMaquina && !maquinasDisponibles.includes(filtroMaquina)) setFiltroMaquina('');
  }, [filtroMaquina, maquinasDisponibles]);

  useEffect(() => {
    if (filtroArea && !areasDisponibles.includes(filtroArea)) setFiltroArea('');
  }, [filtroArea, areasDisponibles]);

  const produccionMaquinaVista = useMemo(
    () => filtroMaquina.trim() ? produccionMaquina.filter(x => x.maquina === filtroMaquina) : produccionMaquina,
    [produccionMaquina, filtroMaquina],
  );
  const usoMaquinasVista = useMemo(
    () => filtroMaquina.trim() ? usoMaquinas.filter(x => x.maquina === filtroMaquina) : usoMaquinas,
    [usoMaquinas, filtroMaquina],
  );
  const eficienciaMaquinaVista = useMemo(
    () => filtroMaquina.trim() ? eficienciaMaquina.filter(x => x.maquina === filtroMaquina) : eficienciaMaquina,
    [eficienciaMaquina, filtroMaquina],
  );
  const horasAreaVista = useMemo(
    () => filtroArea.trim() ? horasArea.filter(x => x.area === filtroArea) : horasArea,
    [horasArea, filtroArea],
  );

  const tieneFiltrosGlobales = Boolean(filtroMaquina.trim() || filtroArea.trim());

  useEffect(() => {
    if (!periodosDisponibles.length) { setPeriodoSeleccionado(''); return; }
    const sorted = [...periodosDisponibles].sort();
    const latest = sorted[sorted.length - 1] ?? periodosDisponibles[0];
    setPeriodoSeleccionado(prev => (prev && periodosDisponibles.includes(prev) ? prev : latest));
  }, [periodosDisponibles]);

  // ooePeriodo: usa el campo .ooe del backend (no .oee)
  const ooePeriodo = useMemo(
    () => ooeMensual.find(x => x.periodo === periodoSeleccionado) ?? null,
    [ooeMensual, periodoSeleccionado],
  );

  const latestOeeRow = useMemo(() => {
    if (!ooeMensual.length) return null;
    return [...ooeMensual].sort((a, b) => b.periodo.localeCompare(a.periodo))[0] ?? null;
  }, [ooeMensual]);

  const latestPeriodLabel = useMemo(() => {
    if (!latestOeeRow) return '';
    const [yy, mm] = latestOeeRow.periodo.split('-');
    const y = Number(yy), mNum = Number(mm);
    if (!Number.isFinite(y) || !Number.isFinite(mNum)) return latestOeeRow.periodo;
    return new Date(y, mNum - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }, [latestOeeRow]);

  const periodLabel = useMemo(() => {
    if (!periodoSeleccionado) return '';
    const [yy, mm] = periodoSeleccionado.split('-');
    const y = Number(yy), mNum = Number(mm);
    if (!Number.isFinite(y) || !Number.isFinite(mNum) || mNum < 1 || mNum > 12) return periodoSeleccionado;
    return new Date(y, mNum - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }, [periodoSeleccionado]);

  // .ooe es el campo del backend Rust — la etiqueta visible dice OEE
  const status = useMemo(() => {
    const v = ooePeriodo?.ooe ?? 0;
    if (v >= metaOee)      return { text: 'En meta',       color: '#10b981' };
    if (v >= metaOee - 10) return { text: 'Riesgo',        color: '#f59e0b' };
    return                        { text: 'Fuera de meta', color: '#ef4444' };
  }, [ooePeriodo?.ooe, metaOee]);

  const pageTitle    = filtrado ? `Detalle — ${centroSeleccionado}` : 'Resumen de producción';
  const pageSubtitle = filtrado
    ? 'Métricas calculadas solo con registros del centro seleccionado. Cambie el filtro en la barra lateral para comparar otros equipos.'
    : 'Monitoreo de indicadores clave de rendimiento institucional y eficiencia de la planta en tiempo real.';

  const MetaChip = ({ icon, color, label, value }: {
    icon: React.ReactNode; color: string; label: string; value: string;
  }) => (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '0.38rem 0.75rem', borderRadius: 999,
      background: `${color}12`, border: `1px solid ${color}28`,
      fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text)', maxWidth: 260,
    }}>
      <span style={{ color, flexShrink: 0 }}>{icon}</span>
      <strong style={{ color: 'var(--text-secondary)', fontWeight: 600, marginRight: 2 }}>{label}</strong>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </span>
  );

  const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div style={{ marginBottom: '0.75rem' }}>
      <h2 style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
        {title}
      </h2>
      {subtitle && <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{subtitle}</p>}
    </div>
  );

  const PanelCard = ({ title, children, accent = 'var(--accent)', style: extraStyle }: {
    title: string; children: React.ReactNode; accent?: string; style?: React.CSSProperties;
  }) => (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
      padding: '1.1rem 1.25rem', border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)', ...extraStyle,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.85rem', paddingBottom: '0.65rem', borderBottom: '1px solid var(--border)' }}>
        <span style={{ width: 3, height: 16, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{title}</h3>
      </div>
      {children}
    </div>
  );

  return (
    <div>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header style={{
        marginBottom: '1rem', padding: '1.5rem 1.75rem',
        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, rgba(15,118,110,.05) 100%)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -50, right: -50, width: 220, height: 220,
          borderRadius: '50%', background: 'radial-gradient(circle, var(--accent-subtle) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', margin: '0 0 0.55rem' }}>
          {filtrado ? 'Panel ejecutivo · Centro filtrado' : 'Inteligencia Operativa en Tiempo Real'}
        </p>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 3vw, 2.1rem)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--text)' }}>
          {pageTitle}
        </h1>
        <p style={{ margin: '0.65rem 0 0', fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: '54rem' }}>
          {pageSubtitle}
        </p>
      </header>

      {/* ── META STRIP ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem',
        padding: '0.65rem 1rem', marginBottom: '1rem',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
      }}>
        <MetaChip icon={<IconFile />}  color="var(--accent)" label="Archivo"   value={data.filename} />
        <MetaChip icon={<IconTable />} color="#0ea5e9"        label="Hoja"      value={data.sheet_used} />
        <MetaChip icon={<IconRows />}  color="#8b5cf6"        label="Registros" value={data.rows.toLocaleString('es-CO')} />
        <button type="button" onClick={onReset} style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          padding: '0.42rem 0.9rem', borderRadius: 999,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
        }}>
          <IconUpload /> Cargar otro
        </button>
      </div>

      {/* ── FILTROS GLOBALES ──────────────────────────────────────────────── */}
      {(maquinasDisponibles.length > 0 || areasDisponibles.length > 0) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem 1rem',
          padding: '0.7rem 1rem', marginBottom: '1rem',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
        }} role="region" aria-label="Filtros de vista del panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', flexBasis: '100%' }}>
            <IconFilter />
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Enfocar vista</span>
          </div>
          {maquinasDisponibles.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Máquina</span>
              <select className="btn btn--ghost" value={filtroMaquina} onChange={e => setFiltroMaquina(e.target.value)} aria-label="Filtrar por máquina" style={{ minWidth: 180 }}>
                <option value="">Todas las máquinas</option>
                {maquinasDisponibles.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
          {areasDisponibles.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Área</span>
              <select className="btn btn--ghost" value={filtroArea} onChange={e => setFiltroArea(e.target.value)} aria-label="Filtrar por área" style={{ minWidth: 160 }}>
                <option value="">Todas las áreas</option>
                {areasDisponibles.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
          {tieneFiltrosGlobales && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setFiltroMaquina(''); setFiltroArea(''); }} style={{ alignSelf: 'flex-end' }}>
              × Quitar filtros
            </button>
          )}
          <p style={{ flexBasis: '100%', margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Máquina afecta: horas por máquina, uso y eficiencia por máquina.
            Área afecta: solo el gráfico &quot;Horas por área&quot;.
            Los KPI y OEE mensual reflejan el centro completo.
          </p>
        </div>
      )}

      {/* ── ALERTA OEE ────────────────────────────────────────────────────── */}
      {latestOeeRow && latestOeeRow.ooe < metaOee && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.7rem 1.1rem', marginBottom: '0.85rem',
          background: latestOeeRow.ooe < metaOee - 10
            ? 'rgba(239,68,68,.08)' : 'rgba(245,158,11,.08)',
          border: `1px solid ${latestOeeRow.ooe < metaOee - 10
            ? 'rgba(239,68,68,.35)' : 'rgba(245,158,11,.35)'}`,
          borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
            {latestOeeRow.ooe < metaOee - 10 ? '🔴' : '🟡'}
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--text)' }}>
            OEE de <strong>{latestPeriodLabel}</strong> en{' '}
            <strong style={{ color: latestOeeRow.ooe < metaOee - 10 ? '#ef4444' : '#f59e0b' }}>
              {latestOeeRow.ooe.toFixed(1)}%
            </strong>{' '}
            — meta configurada: <strong>{metaOee}%</strong>
          </span>
        </div>
      )}

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '1rem' }}>
        <SectionHeader
          title={filtrado ? 'Indicadores del centro' : 'Indicadores clave'}
          subtitle="Métricas agregadas del período completo cargado"
        />
        <KPICards
          resumen={resumen}
          resumenGlobal={filtrado ? data.metrics.global.resumen : undefined}
          metaOee={metaOee}
        />
      </section>

      {/* ── GRÁFICOS FILA 1 ───────────────────────────────────────────────── */}
      <div className="dash-two-col">
        <PanelCard title="Horas por máquina / centro" accent="#0ea5e9">
          <ProductionChart data={produccionMaquinaVista} />
        </PanelCard>
        <PanelCard title="Horas por área" accent="#8b5cf6">
          <HoursAreaChart data={horasAreaVista} />
        </PanelCard>
      </div>

      {/* ── GRÁFICOS FILA 2 ───────────────────────────────────────────────── */}
      <div className="dash-two-col dash-two-col--spaced">
        <PanelCard title="Distribución de tiempo" accent="#10b981">
          <ProductivoChart data={productivoImproductivo} />
        </PanelCard>
        <PanelCard title="Uso de máquinas" accent="#f59e0b">
          <UsoMaquinasChart data={usoMaquinasVista} />
        </PanelCard>
      </div>

      {/* ── EFICIENCIAS ───────────────────────────────────────────────────── */}
      <PanelCard title="Eficiencia por funcionario" accent="#ec4899" style={{ marginTop: '1rem' }}>
        <EfficiencyTable data={eficienciaFuncionarios} />
      </PanelCard>

      <PanelCard title="Eficiencia por máquina" accent="#ef4444" style={{ marginTop: '1rem' }}>
        <EficienciaMaquinaTable data={eficienciaMaquinaVista} />
      </PanelCard>

      {/* ── OEE MENSUAL ───────────────────────────────────────────────────── */}
      <PanelCard title="OEE mensual" accent="var(--accent)" style={{ marginTop: '1rem' }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center',
          marginBottom: '0.85rem', padding: '0.65rem 0.85rem',
          background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Período:
            <select
              className="btn btn--ghost btn--sm"
              value={periodoSeleccionado}
              onChange={e => setPeriodoSeleccionado(e.target.value)}
              style={{ minWidth: 160 }}
            >
              {periodosDisponibles.map(p => {
                const [yy, mm] = p.split('-');
                const y = Number(yy), mNum = Number(mm);
                const lbl = Number.isFinite(y) && Number.isFinite(mNum)
                  ? new Date(y, mNum - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
                  : p;
                return <option key={p} value={p}>{lbl}</option>;
              })}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Meta OEE:
            <input
              type="number" value={metaOee} min={0} max={100} step={0.5}
              onChange={e => setMetaOee(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              style={{
                width: 72, padding: '0.35rem 0.5rem',
                border: '1px solid var(--border-strong)', borderRadius: 8,
                background: 'var(--bg-elevated)', color: 'var(--text)',
                fontSize: '0.8125rem', fontWeight: 600,
              }}
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>%</span>
          </label>

          {ooePeriodo && (
            <div style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
              padding: '0.35rem 0.85rem', borderRadius: 999,
              background: `${status.color}15`, border: `1px solid ${status.color}35`,
            }}>
              <span style={{
                width: 9, height: 9, borderRadius: '50%',
                background: status.color, boxShadow: `0 0 6px ${status.color}90`,
              }} />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: status.color }}>
                {periodLabel} · OEE {ooePeriodo.ooe.toFixed(2)}% · {status.text}
              </span>
            </div>
          )}
        </div>

        {/* Pasa ooe_mensual al componente — la prop se llama 'data' internamente */}
        <OEEMonthlyTable data={ooeMensual} meta={metaOee} />
      </PanelCard>

    </div>
  );
}
