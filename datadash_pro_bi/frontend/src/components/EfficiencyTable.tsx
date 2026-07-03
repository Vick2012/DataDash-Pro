import { useState, type CSSProperties } from 'react';

const PAGE_SIZE = 10;

interface Item {
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
}

interface Props {
  data: Item[];
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
  fontSize: '1.0625rem',
  letterSpacing: '0.02em',
};

const tdStyle: CSSProperties = {
  padding: '0.5rem 0.4rem',
  borderBottom: '1px solid var(--border)',
};

export default function EfficiencyTable({ data }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const safeData = Array.isArray(data) ? data : [];
  if (!safeData.length) return <p style={{ color: 'var(--text-muted)' }}>Sin datos</p>;

  const totalPages = Math.ceil(safeData.length / PAGE_SIZE) || 1;
  const start = page * PAGE_SIZE;
  const paginatedData = safeData.slice(start, start + PAGE_SIZE);

  const toggleRow = (funcionario: string) => {
    setSelected((prev) => (prev === funcionario ? null : funcionario));
  };

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
        <thead>
          <tr style={{ background: 'rgba(30, 41, 59, 0.8)' }}>
            <th style={thStyle}>Funcionario</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Horas</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Producción</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Productividad</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>STD promedio</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Eficiencia %</th>
          </tr>
        </thead>
        <tbody>
          {paginatedData.map((row) => {
            const isSelected = selected === row.funcionario;
            const rowStyle: CSSProperties = isSelected
              ? { background: 'rgba(59, 130, 246, 0.2)', cursor: 'pointer' }
              : { cursor: 'pointer' };
            return (
              <tr
                key={row.funcionario}
                style={rowStyle}
                onClick={() => toggleRow(row.funcionario)}
              >
                <td style={tdStyle}>{row.funcionario}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{row.horas.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{row.produccion.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{row.productividad.toFixed(2)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {row.tiene_std ? row.std_promedio.toFixed(2) : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {row.tiene_std ? `${row.eficiencia_pct.toFixed(2)}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '0.75rem',
        paddingTop: '0.5rem',
        borderTop: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {start + 1}-{Math.min(start + PAGE_SIZE, safeData.length)} de {safeData.length}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              padding: '0.35rem 0.75rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text)',
              cursor: page === 0 ? 'not-allowed' : 'pointer',
              opacity: page === 0 ? 0.5 : 1,
            }}
          >
            Anterior
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{
              padding: '0.35rem 0.75rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text)',
              cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages - 1 ? 0.5 : 1,
            }}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
