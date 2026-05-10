interface Props {
  resumen: {
    total_horas: number;
    total_produccion: number;
    total_ordenes: number;
    total_funcionarios: number;
    total_maquinas: number;
    ooe_global: number;
  };
}

export default function KPICards({ resumen }: Props) {
  const items = [
    { label: 'Total horas', value: resumen.total_horas.toLocaleString(), unit: 'h', highlight: false },
    { label: 'Producción', value: resumen.total_produccion.toLocaleString(), unit: '', highlight: false },
    { label: 'Órdenes', value: resumen.total_ordenes.toLocaleString(), unit: '', highlight: false },
    { label: 'Funcionarios', value: resumen.total_funcionarios.toLocaleString(), unit: '', highlight: false },
    { label: 'Máquinas', value: resumen.total_maquinas.toLocaleString(), unit: '', highlight: false },
    { label: 'OOE global', value: resumen.ooe_global.toFixed(2), unit: '%', highlight: true },
  ];

  return (
    <div className="kpi-grid">
      {items.map(({ label, value, unit, highlight }) => (
        <div key={label} className={`kpi-card${highlight ? ' kpi-card--highlight' : ''}`}>
          <p className="kpi-card__label">{label}</p>
          <p className="kpi-card__value">
            {value}
            {unit ? <span className="kpi-card__unit">{unit}</span> : null}
          </p>
        </div>
      ))}
    </div>
  );
}
