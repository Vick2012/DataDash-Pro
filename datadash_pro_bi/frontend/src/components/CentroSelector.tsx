import type { MetricsResponse } from '../types';

interface Props {
  data: MetricsResponse;
  value: string;
  onChange: (centroKey: string) => void;
}

export default function CentroSelector({ data, value, onChange }: Props) {
  const { centros } = data.metrics;

  if (centros.length === 0) {
    return (
      <div className="sidebar-centro-panel">
        <p className="sidebar-centro-label">Centro de producción</p>
        <p className="sidebar-centro-empty">
          No se detectó la columna <strong>centro</strong> en este archivo. Cargue un consolidado Printux con máquina /
          centro para filtrar aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="sidebar-centro-panel">
      <label className="sidebar-centro-label" htmlFor="centro-select">
        Centro de producción
      </label>
      <p className="sidebar-centro-hint">Elija un centro para ver KPIs y tablas solo de ese equipo.</p>
      <select
        id="centro-select"
        className="sidebar-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filtrar por centro de producción"
      >
        <option value="">Todos los centros (consolidado)</option>
        {centros.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {value ? (
        <p className="sidebar-centro-meta">
          {data.metrics.por_centro[value]?.resumen.total_horas.toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}{' '}
          h registradas en este centro
        </p>
      ) : null}
    </div>
  );
}
