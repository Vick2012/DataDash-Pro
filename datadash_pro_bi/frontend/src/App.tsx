import { useState, useEffect } from 'react';
import AppShell from './components/AppShell';
import UploadZone from './components/UploadZone';
import Dashboard from './components/Dashboard';
import BoletinPanel from './components/BoletinPanel';
import CentroSelector from './components/CentroSelector';
import ProcessingOverlay from './components/ProcessingOverlay';
import type { MetricsResponse } from './types';
import { isTauriRuntime } from './tauriRuntime';
import ChatPanel from './components/ChatPanel';

type Theme = 'dark' | 'light';

function FeatureCard({
  imageSrc,
  imageAlt,
  title,
  description,
}: {
  imageSrc: string;
  imageAlt: string;
  title: string;
  description: string;
}) {
  return (
    <div className="feature-card">
      <div className="feature-card__icon feature-card__icon--image" aria-hidden>
        <img src={imageSrc} alt={imageAlt} className="feature-card__thumb" loading="lazy" />
      </div>
      <h3 className="feature-card__title">{title}</h3>
      <p className="feature-card__desc">{description}</p>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [productionPath, setProductionPath] = useState<string | null>(null);
  const [centroSel, setCentroSel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  /** Evita que WebView2 abra el archivo al soltarlo. La ruta la entrega Tauri v?a onDragDropEvent. */
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const blockDefault = (e: DragEvent) => {
      e.preventDefault();
    };
    document.addEventListener('dragover', blockDefault);
    document.addEventListener('drop', blockDefault);
    return () => {
      document.removeEventListener('dragover', blockDefault);
      document.removeEventListener('drop', blockDefault);
    };
  }, []);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const onUploadSuccess = (resp: MetricsResponse, filePath: string) => {
    setData(resp);
    setProductionPath(filePath.trim() || null);
    setCentroSel('');
    setError(null);
  };

  const onUploadError = (msg: string) => {
    setError(msg);
    setData(null);
    setProductionPath(null);
    setCentroSel('');
  };

  const onReset = () => {
    setData(null);
    setProductionPath(null);
    setCentroSel('');
    setError(null);
  };

  const topBar = (
    <div className="app-topbar">
      <div className="app-topbar__search">
        <span className="app-topbar__search-icon" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input type="search" className="app-topbar__search-input" placeholder="Buscar máquina o centro" aria-label="Buscar máquina o centro" />
      </div>
      {data ? (
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Volver al inicio
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn--ghost"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      >
        {theme === 'dark' ? (
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    </div>
  );

  const sidebarFooter = (
    <>
      <span>DataDash Pro BI ? Escritorio</span>
    </>
  );

  const sidebarPanel =
    data != null ? (
      <>
        <CentroSelector data={data} value={centroSel} onChange={setCentroSel} />
        <BoletinPanel productionPath={productionPath} />
        <ChatPanel data={data} centroSeleccionado={centroSel} />
      </>
    ) : (
      <ChatPanel data={null} />
    );

  const showBrowserDevHint = import.meta.env.DEV && !isTauriRuntime();

  return (
    <AppShell variant={data ? 'dashboard' : 'welcome'} sidebarPanel={sidebarPanel} sidebarFooter={sidebarFooter}>
      {topBar}

      {!data ? (
        <>
          {showBrowserDevHint ? (
            <div className="dev-browser-banner" role="status">
              <strong>Est? en el navegador (solo vista previa de Vite)</strong>
              Para elegir o soltar archivos Excel necesita la <strong>ventana de escritorio</strong>{' '}
              &quot;DataDash Pro BI&quot; que abre al ejecutar <code>npm run tauri:dev</code> en la ra?z del
              proyecto. No use solo la pesta?a <code>http://localhost:5175</code> en Chrome o Edge.
            </div>
          ) : null}

          <header className="welcome-hero">
            <p className="welcome-hero__eyebrow">An?lisis de producci?n</p>
            <h1 className="welcome-hero__title">Cargue sus reportes y obtenga indicadores en minutos</h1>
            <p className="welcome-hero__lead">
              Compatible con archivos Excel procedentes de flujos tipo Printux: consolidados, minutas y m?tricas
              operativas. Sin env?o de datos a la nube.
            </p>
          </header>

          <UploadZone onSuccess={onUploadSuccess} onError={onUploadError} setLoading={setLoading} />
          {loading && <ProcessingOverlay />}

          <div className="feature-grid">
            <FeatureCard
              imageSrc="/assets/formatos-soportados.png"
              imageAlt=""
              title="Integraci?n con Excel"
              description="Soporte para .xlsx y .xls con varias hojas y detecci?n orientada a columnas de producci?n."
            />
            <FeatureCard
              imageSrc="/assets/graficos-interactivos.png"
              imageAlt=""
              title="Visualizaci?n ejecutiva"
              description="Gr?ficos y tablas para producci?n por m?quina, horas por ?rea, eficiencia y uso de recursos."
            />
            <FeatureCard
              imageSrc="/assets/datos-a-escala.png"
              imageAlt=""
              title="KPIs operativos"
              description="Resumen de ?rdenes, personal, m?quinas y contraste productivo frente a improductivo."
            />
          </div>
        </>
      ) : (
        <Dashboard data={data} onReset={onReset} centroSeleccionado={centroSel} />
      )}

      {error ? <div className="alert-error">{error}</div> : null}
    </AppShell>
  );
}
