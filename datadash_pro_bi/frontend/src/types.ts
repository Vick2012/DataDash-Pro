/** Bloque de KPI y gráficos (global o filtrado por un centro). */
export interface AllMetrics {
  resumen: {
    total_horas: number;
    total_produccion: number;
    total_ordenes: number;
    total_funcionarios: number;
    total_maquinas: number;
    ooe_global: number;
  };
  produccion_maquina: { maquina: string; horas: number }[];
  horas_area: { area: string; horas: number }[];
  eficiencia_funcionarios: {
    funcionario: string;
    horas: number;
    produccion: number;
    productividad: number;
    std_promedio: number;
    eficiencia_pct: number;
    tiene_std: boolean;
    h_alist: number;
    p_alist: number;
    h_imp: number;
    p_imp: number;
    h_prod: number;
    p_prod: number;
    h_sin: number;
    p_sin: number;
  }[];
  productivo_improductivo: { tipo: string; horas: number }[];
  uso_maquinas: { maquina: string; horas: number }[];
  eficiencia_maquina: {
    maquina: string;
    horas_uso: number;
    mantenimiento: number;
    total: number;
  }[];
  ooe_mensual: {
    periodo: string;
    horas_productivas: number;
    horas_totales: number;
    ooe: number;
  }[];
}

export interface MetricsBundle {
  global: AllMetrics;
  centros: string[];
  por_centro: Record<string, AllMetrics>;
}

export interface MetricsResponse {
  filename: string;
  sheet_used: string;
  rows: number;
  metrics: MetricsBundle;
}

export function activeMetricsForCentro(data: MetricsResponse, centroKey: string): AllMetrics {
  if (!centroKey.trim()) return data.metrics.global;
  const block = data.metrics.por_centro[centroKey];
  return block ?? data.metrics.global;
}