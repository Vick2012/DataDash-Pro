import type { CSSProperties } from 'react';

interface OoeMensualRow {
  periodo: string;
  horas_productivas: number;
  horas_totales: number;
  ooe: number;
}

interface Props {
  data: OoeMensualRow[];
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9375rem',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '0.75rem 0.5rem',
  borderBottom: '2px solid var(--border)',
  background: 'rgba(30, 41, 59, 0.8)',
  color: '#f1f5f9',
  fontWeight: 700,
  fontSize: '1rem',
};

const tdStyle: CSSProperties = {
  padding: '0.5rem 0.4rem',
  borderBottom: '1px solid var(--border)',
};

export default function OOEMonthlyTable({ data }: Props) {
  if (data.length === 0) {
    return <p style={{ opacity: 0.8 }}>No hay fechas válidas para calcular OOE mensual.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Periodo</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Horas productivas</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Horas totales</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>OOE</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.periodo}>
              <td style={tdStyle}>{row.periodo}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                {row.horas_productivas.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                {row.horas_totales.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.ooe.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
