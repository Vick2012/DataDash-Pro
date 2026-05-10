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
import OOEMonthlyTable from './OOEMonthlyTable';

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

export default function Dashboard({ data, onReset, centroSeleccionado }: Props) {
  const m = activeMetricsForCentro(data, centroSeleccionado);
  const resumen = m.resumen ?? defaultResumen;
  const produccionMaquina = m.produccion_maquina ?? [];
  const horasArea = m.horas_area ?? [];
  const productivoImproductivo = m.productivo_improductivo ?? [];
  const usoMaquinas = m.uso_maquinas ?? [];
  const eficienciaFuncionarios = m.eficiencia_funcionarios ?? [];
  const eficienciaMaquina = m.eficiencia_maquina ?? [];
  const ooeMensual = m.ooe_mensual ?? [];
  const filtrado = Boolean(centroSeleccionado.trim());
  const [metaOoe, setMetaOoe] = useState(85);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('');
  const [filtroMaquina, setFiltroMaquina] = useState('');
  const [filtroArea, setFiltroArea] = useState('');

  const periodosDisponibles = useMemo(() => ooeMensual.map((x) => x.periodo), [ooeMensual]);

  useEffect(() => {
    setFiltroMaquina('');
    setFiltroArea('');
  }, [centroSeleccionado]);

  const maquinasDisponibles = useMemo(() => {
    const names = new Set<string>();
    for (const row of produccionMaquina) {
      const n = row.maquina?.trim();
      if (n) names.add(row.maquina);
    }
    for (const row of usoMaquinas) {
      const n = row.maquina?.trim();
      if (n) names.add(row.maquina);
    }
    for (const row of eficienciaMaquina) {
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

  const produccionMaquinaVista = useMemo(() => {
    if (!filtroMaquina.trim()) return produccionMaquina;
    return produccionMaquina.filter((x) => x.maquina === filtroMaquina);
  }, [produccionMaquina, filtroMaquina]);

  const usoMaquinasVista = useMemo(() => {
    if (!filtroMaquina.trim()) return usoMaquinas;
    return usoMaquinas.filter((x) => x.maquina === filtroMaquina);
  }, [usoMaquinas, filtroMaquina]);

  const eficienciaMaquinaVista = useMemo(() => {
    if (!filtroMaquina.trim()) return eficienciaMaquina;
    return eficienciaMaquina.filter((x) => x.maquina === filtroMaquina);
  }, [eficienciaMaquina, filtroMaquina]);

  const horasAreaVista = useMemo(() => {
    if (!filtroArea.trim()) return horasArea;
    return horasArea.filter((x) => x.area === filtroArea);
  }, [horasArea, filtroArea]);

  const tieneFiltrosGlobales = Boolean(filtroMaquina.trim() || filtroArea.trim());

  useEffect(() => {
    if (periodosDisponibles.length === 0) {
      setPeriodoSeleccionado('');
      return;
    }
    const ordered = [...periodosDisponibles].sort();
    const latest = ordered[ordered.length - 1] ?? periodosDisponibles[0];
    setPeriodoSeleccionado((prev) => (prev && periodosDisponibles.includes(prev) ? prev : latest));
  }, [periodosDisponibles]);

  const ooePeriodo = useMemo(
    () => ooeMensual.find((x) => x.periodo === periodoSeleccionado) ?? null,
    [ooeMensual, periodoSeleccionado],
  );

  const periodLabel = useMemo(() => {
    if (!periodoSeleccionado) return '';
    const [yy, mm] = periodoSeleccionado.split('-');
    const y = Number(yy);
    const mNum = Number(mm);
    if (!Number.isFinite(y) || !Number.isFinite(mNum) || mNum < 1 || mNum > 12) return periodoSeleccionado;
    const date = new Date(y, mNum - 1, 1);
    return date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }, [periodoSeleccionado]);

  const status = useMemo(() => {
    const value = ooePeriodo?.ooe ?? 0;
    const warning = Math.max(0, metaOoe - 10);
    if (value >= metaOoe) return { text: 'En meta', color: '#22c55e' };
    if (value >= warning) return { text: 'Riesgo', color: '#f59e0b' };
    return { text: 'Fuera de meta', color: '#ef4444' };
  }, [ooePeriodo?.ooe, metaOoe]);

  const pageTitle = filtrado ? `Detalle — ${centroSeleccionado}` : 'Resumen de producción';
  const pageSubtitle = filtrado
    ? 'Métricas calculadas solo con registros del centro seleccionado. Cambie el filtro en la barra lateral para comparar otros equipos.'
    : 'Monitoreo de indicadores clave de rendimiento institucional y eficiencia de la planta en tiempo real.';

  return (
    <div>
      <header className="dash-page-header">
        <p className="welcome-hero__eyebrow dash-page-header__eyebrow">
          {filtrado ? 'Panel ejecutivo' : 'Inteligencia Operativa en Tiempo Real'}
        </p>
        <h1 className="welcome-hero__title dash-page-header__title">{pageTitle}</h1>
        <p className="dash-page-header__subtitle">{pageSubtitle}</p>
      </header>

      <div className="dash-meta-strip">
        <span className="dash-meta-chip dash-meta-chip--file" title={data.filename}>
          <strong>Archivo</strong> <span className="dash-meta-chip__text">{data.filename}</span>
        </span>
        <span className="dash-meta-chip">
          <strong>Hoja</strong> {data.sheet_used}
        </span>
        <span className="dash-meta-chip">
          <strong>Registros</strong> {data.rows.toLocaleString()}
        </span>
        <button type="button" className="btn btn--sm dash-meta-strip__action" onClick={onReset}>
          Cargar otro archivo
        </button>
      </div>

      {(maquinasDisponibles.length > 0 || areasDisponibles.length > 0) ? (
        <div className="dash-global-filters" role="region" aria-label="Filtros de vista del panel">
          <span className="dash-global-filters__label">Enfocar vista</span>
          {maquinasDisponibles.length > 0 ? (
            <label className="dash-global-filters__field">
              <span>Máquina</span>
              <select
                className="btn btn--ghost"
                value={filtroMaquina}
                onChange={(e) => setFiltroMaquina(e.target.value)}
                aria-label="Filtrar gráficos y tabla por máquina"
              >
                <option value="">Todas</option>
                {maquinasDisponibles.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {areasDisponibles.length > 0 ? (
            <label className="dash-global-filters__field">
              <span>Área</span>
              <select
                className="btn btn--ghost"
                value={filtroArea}
                onChange={(e) => setFiltroArea(e.target.value)}
                aria-label="Filtrar gráfico de horas por área"
              >
                <option value="">Todas</option>
                {areasDisponibles.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {tieneFiltrosGlobales ? (
            <button
              type="button"
              className="btn btn--sm btn--ghost dash-global-filters__clear"
              onClick={() => {
                setFiltroMaquina('');
                setFiltroArea('');
              }}
            >
              Quitar filtros
            </button>
          ) : null}
          <p className="dash-global-filters__hint">
            Máquina: horas por máquina, uso y eficiencia por máquina. Área: solo &quot;Horas por área&quot;. Los KPI y OOE
            mensual siguen del centro completo.
          </p>
        </div>
      ) : null}

      <section className="dash-kpi-section">
        <h2 className="dash-section-title">{filtrado ? 'Indicadores del centro' : 'Indicadores clave'}</h2>
        <KPICards resumen={resumen} />
      </section>

      <div className="dash-two-col">
        <div className="panel-card panel-card--compact">
          <h3 className="dash-panel-title">Horas por máquina / centro en esta vista</h3>
          <ProductionChart data={produccionMaquinaVista} />
        </div>
        <div className="panel-card panel-card--compact">
          <h3 className="dash-panel-title">Horas por área</h3>
          <HoursAreaChart data={horasAreaVista} />
        </div>
      </div>

      <div className="dash-two-col dash-two-col--spaced">
        <div className="panel-card panel-card--compact">
          <h3 className="dash-panel-title">Productivo vs. improductivo</h3>
          <ProductivoChart data={productivoImproductivo} />
        </div>
        <div className="panel-card panel-card--compact">
          <h3 className="dash-panel-title">Uso de máquinas</h3>
          <UsoMaquinasChart data={usoMaquinasVista} />
        </div>
      </div>

      <div className="panel-card" style={{ marginTop: '1.25rem' }}>
        <h3 className="dash-panel-title">Eficiencia por funcionario</h3>
        <EfficiencyTable data={eficienciaFuncionarios} />
      </div>

      <div className="panel-card" style={{ marginTop: '1.25rem' }}>
        <h3 className="dash-panel-title">Eficiencia por máquina</h3>
        <EficienciaMaquinaTable data={eficienciaMaquinaVista} />
      </div>

      <div className="panel-card" style={{ marginTop: '1.25rem' }}>
        <h3 className="dash-panel-title">OOE mensual</h3>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            marginBottom: '0.85rem',
          }}
        >
          <label style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            <span>Mes:</span>
            <select
              className="btn btn--ghost"
              value={periodoSeleccionado}
              onChange={(e) => setPeriodoSeleccionado(e.target.value)}
              style={{ minWidth: 180 }}
            >
              {periodosDisponibles.map((p) => {
                const [yy, mm] = p.split('-');
                const y = Number(yy);
                const mNum = Number(mm);
                const date = new Date(y, mNum - 1, 1);
                const label = Number.isFinite(y) && Number.isFinite(mNum)
                  ? date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
                  : p;
                return (
                  <option key={p} value={p}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>

          <label style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            <span>Meta OOE (%):</span>
            <input
              type="number"
              value={metaOoe}
              min={0}
              max={100}
              step={0.5}
              onChange={(e) => setMetaOoe(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              style={{ width: 90 }}
            />
          </label>

          {ooePeriodo ? (
            <span
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 600,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: status.color,
                  boxShadow: `0 0 8px ${status.color}80`,
                }}
              />
              {periodLabel} · OOE {ooePeriodo.ooe.toFixed(2)}% · {status.text}
            </span>
          ) : null}
        </div>
        <OOEMonthlyTable data={ooeMensual} />
      </div>
    </div>
  );
}
