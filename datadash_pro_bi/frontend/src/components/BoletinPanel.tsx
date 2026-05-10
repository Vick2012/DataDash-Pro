import { useCallback, useEffect, useMemo, useState } from 'react';
import { isTauriRuntime } from '../tauriRuntime';

export interface BoletinFilters {
  centros: string[];
  funcionarios_por_centro: Record<string, string[]>;
}

interface Props {
  productionPath: string | null;
}

/**
 * Boletín INC en barra lateral (centro + colaborador + periodo).
 * Tauri 2 espera argumentos en camelCase en el invoke.
 */
export default function BoletinPanel({ productionPath }: Props) {
  const [filters, setFilters] = useState<BoletinFilters | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [centro, setCentro] = useState('');
  const [funcionario, setFuncionario] = useState('');
  const [periodo, setPeriodo] = useState('FEBRERO 2026');
  const [stdPorAreaPath, setStdPorAreaPath] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const refreshCentros = useCallback(async () => {
    if (!productionPath?.trim()) {
      setFilters(null);
      return;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke<string>('list_boletin_filters_cmd', {
      productionPath: productionPath.trim(),
    });
    const parsed = JSON.parse(raw) as BoletinFilters;
    setFilters(parsed);
    setCentro((prev) => {
      if (prev && parsed.centros.includes(prev)) return prev;
      return parsed.centros[0] ?? '';
    });
  }, [productionPath]);

  useEffect(() => {
    if (!productionPath?.trim()) {
      setFilters(null);
      setCentro('');
      setFuncionario('');
      return;
    }
    let cancelled = false;
    setLoadErr(null);
    setBusy(true);
    refreshCentros()
      .then(() => {
        if (!cancelled) setDoneMsg(null);
      })
      .catch((e) => {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productionPath, refreshCentros]);

  const peopleForCentro = useMemo(() => {
    if (!centro || !filters?.funcionarios_por_centro[centro]) return [];
    return filters.funcionarios_por_centro[centro];
  }, [centro, filters]);

  useEffect(() => {
    if (!peopleForCentro.length) {
      setFuncionario('');
      return;
    }
    setFuncionario((prev) => (prev && peopleForCentro.includes(prev) ? prev : peopleForCentro[0] ?? ''));
  }, [peopleForCentro, centro]);

  const runExport = async (format: 'xlsx' | 'pdf') => {
    if (!isTauriRuntime()) return;
    if (!productionPath?.trim()) {
      setLoadErr('Falta el archivo de producción.');
      return;
    }
    if (!centro.trim() || !funcionario.trim()) {
      setLoadErr('Elija centro de producción y colaborador.');
      return;
    }
    const { save } = await import('@tauri-apps/plugin-dialog');
    const safeCentro = centro.replace(/[/\\?%*:|"<>]/g, '_');
    const safeName = funcionario.replace(/\s+/g, '_');
    const out =
      format === 'pdf'
        ? await save({
            title: 'Guardar boletín PDF',
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
            defaultPath: `Boletin_${safeCentro}_${safeName}.pdf`,
          })
        : await save({
            title: 'Guardar boletín Excel',
            filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
            defaultPath: `Boletin_${safeCentro}_${safeName}.xlsx`,
          });
    if (out === null) return;
    setBusy(true);
    setLoadErr(null);
    setDoneMsg(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const stdArg = stdPorAreaPath?.trim() ? stdPorAreaPath.trim() : null;
      if (format === 'pdf') {
        await invoke('generate_boletin_pdf_cmd', {
          productionPath: productionPath.trim(),
          outputPath: out,
          centro: centro.trim(),
          funcionario: funcionario.trim(),
          periodo: periodo.trim() || '—',
          stdPorAreaPath: stdArg,
        });
      } else {
        await invoke('generate_boletin_cmd', {
          productionPath: productionPath.trim(),
          outputPath: out,
          centro: centro.trim(),
          funcionario: funcionario.trim(),
          periodo: periodo.trim() || '—',
          stdPorAreaPath: stdArg,
        });
      }
      setDoneMsg(`Guardado: ${out}`);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pathOk = Boolean(productionPath?.trim());

  return (
    <div className="sidebar-boletin-panel">
      <h3 className="sidebar-boletin-title">Generar boletín</h3>
      <p className="sidebar-boletin-hint">
        PDF en apaisado; actividad en varias líneas. Opcional: <strong>STD POR AREA.xlsx</strong> para llenar estándar y
        eficiencia %. USO DEL TIEMPO según columna Tipo/filtro del Excel.
      </p>

      {!pathOk ? (
        <p className="alert-error">Vuelva a cargar el Excel por diálogo o arrastre para habilitar el boletín.</p>
      ) : null}

      <div className="sidebar-boletin-fields">
        <div>
          <label className="sidebar-boletin-field-label" htmlFor="boletin-centro">
            Centro (boletín)
          </label>
          <select
            id="boletin-centro"
            className="sidebar-select"
            value={centro}
            onChange={(e) => setCentro(e.target.value)}
            disabled={busy || !pathOk || !filters?.centros.length}
          >
            {filters?.centros?.length ? (
              filters.centros.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))
            ) : (
              <option value="">{pathOk ? 'Cargando centros…' : '—'}</option>
            )}
          </select>
        </div>
        <div>
          <label className="sidebar-boletin-field-label" htmlFor="boletin-func">
            Colaborador
          </label>
          <select
            id="boletin-func"
            className="sidebar-select"
            value={funcionario}
            onChange={(e) => setFuncionario(e.target.value)}
            disabled={busy || !pathOk || !peopleForCentro.length}
          >
            {peopleForCentro.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="sidebar-boletin-field-label" htmlFor="boletin-periodo">
            Periodo
          </label>
          <input
            id="boletin-periodo"
            className="sidebar-boletin-input"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            disabled={busy || !pathOk}
            placeholder="Ej. FEBRERO 2026"
          />
        </div>
        <div className="sidebar-boletin-std-row">
          <span className="sidebar-boletin-field-label">STD POR AREA (opcional)</span>
          <div className="sidebar-boletin-std-actions">
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={busy || !pathOk}
              onClick={() =>
                void (async () => {
                  const { open } = await import('@tauri-apps/plugin-dialog');
                  const picked = await open({
                    title: 'STD POR AREA.xlsx',
                    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'xlsm'] }],
                    multiple: false,
                  });
                  if (typeof picked === 'string') setStdPorAreaPath(picked);
                  else if (Array.isArray(picked) && picked[0]) setStdPorAreaPath(picked[0]);
                })()
              }
            >
              Elegir archivo…
            </button>
            {stdPorAreaPath ? (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={busy}
                onClick={() => setStdPorAreaPath(null)}
              >
                Quitar
              </button>
            ) : null}
          </div>
          {stdPorAreaPath ? (
            <p className="sidebar-boletin-std-path" title={stdPorAreaPath}>
              {stdPorAreaPath.length > 42 ? `…${stdPorAreaPath.slice(-40)}` : stdPorAreaPath}
            </p>
          ) : null}
        </div>
      </div>

      <div className="sidebar-boletin-actions sidebar-boletin-actions--row">
        <button
          type="button"
          className="btn"
          onClick={() => void runExport('xlsx')}
          disabled={busy || !pathOk || !centro || !funcionario}
        >
          Excel
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => void runExport('pdf')}
          disabled={busy || !pathOk || !centro || !funcionario}
        >
          PDF
        </button>
      </div>

      {busy ? (
        <p className="sidebar-boletin-hint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          Procesando…
        </p>
      ) : null}

      {loadErr ? <div className="alert-error">{loadErr}</div> : null}
      {doneMsg ? <p className="sidebar-boletin-done">{doneMsg}</p> : null}
    </div>
  );
}
