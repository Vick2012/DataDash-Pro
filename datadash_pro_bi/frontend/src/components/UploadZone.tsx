import { useCallback, useEffect } from 'react';
import type { MetricsResponse } from '../types';
import { isTauriRuntime } from '../tauriRuntime';

const EXCEL_RE = /\.(xlsx|xlsm|xls)$/i;

const BROWSER_HINT =
  'El navegador no tiene el backend de Tauri: no puede cargar Excel aquí. Cierre esta pestaña y use la ventana de escritorio "DataDash Pro BI" que abre al ejecutar npm run tauri:dev (o npm run tauri:dev:win desde la raíz del repo).';

interface Props {
  /** `filePath` es la ruta absoluta del Excel; permite generar boletines sin volver a subir el archivo. */
  onSuccess: (data: MetricsResponse, filePath: string) => void;
  onError: (msg: string) => void;
  setLoading: (v: boolean) => void;
}

async function invokeUploadPath(path: string): Promise<MetricsResponse> {
  const { invoke } = await import('@tauri-apps/api/core');
  const raw = await invoke<string>('upload_excel', { path });
  return JSON.parse(raw) as MetricsResponse;
}

function formatInvokeError(e: unknown): string {
  let msg = e instanceof Error ? e.message : String(e);
  if (/cannot read properties of undefined.*invoke|reading 'invoke'|invoke.*undefined/i.test(msg)) {
    return `${BROWSER_HINT}\n\n(Detalle técnico: ${msg})`;
  }
  if (/connection refused|ipc|failed to fetch|not allowed/i.test(msg)) {
    msg +=
      '\n\nCompruebe que la ventana es la app de Tauri (no solo el navegador) y que el backend Rust compiló sin errores.';
  }
  return msg;
}

export default function UploadZone({ onSuccess, onError, setLoading }: Props) {
  const runUpload = useCallback(
    async (fn: () => Promise<MetricsResponse>, sourcePath: string) => {
      setLoading(true);
      onError('');
      try {
        const json = await fn();
        onSuccess(json, sourcePath);
      } catch (e) {
        onError(formatInvokeError(e));
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onError, setLoading],
  );

  const processDroppedPath = useCallback(
    (path: string) => {
      if (!EXCEL_RE.test(path)) {
        onError('Solo se aceptan archivos Excel (.xlsx, .xls, .xlsm).');
        return;
      }
      void runUpload(() => invokeUploadPath(path), path);
    },
    [runUpload, onError],
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (cancelled || event.payload.type !== 'drop') return;
        const path = event.payload.paths.find((p) => EXCEL_RE.test(p));
        if (!path) {
          if (event.payload.paths.length > 0) {
            onError('Solo se aceptan archivos Excel (.xlsx, .xls, .xlsm).');
          }
          return;
        }
        processDroppedPath(path);
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [processDroppedPath, onError]);

  const openNativePicker = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      title: 'Elegir archivo Excel',
      multiple: false,
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'xlsm'] }],
    });
    if (selected === null) return;
    const path = typeof selected === 'string' ? selected : null;
    if (!path || !EXCEL_RE.test(path)) {
      onError('Solo se aceptan archivos Excel (.xlsx, .xls, .xlsm).');
      return;
    }
    void runUpload(() => invokeUploadPath(path), path);
  };

  const handleClick = () => {
    if (!isTauriRuntime()) {
      onError(BROWSER_HINT);
      return;
    }
    void openNativePicker().catch((e) => onError(formatInvokeError(e)));
  };

  const preventBrowserDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="upload-zone"
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      onDragEnter={preventBrowserDrop}
      onDragOver={preventBrowserDrop}
      onDrop={preventBrowserDrop}
    >
      <div className="upload-zone__icon" aria-hidden>
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
      </div>
      <p className="upload-zone__title">Arrastre el Excel a la ventana o haga clic para elegirlo</p>
      <p className="upload-zone__hint">
        Formatos: .xlsx, .xls, .xlsm · En la app de escritorio se abre el diálogo nativo y se lee el archivo por ruta.
      </p>
    </div>
  );
}
