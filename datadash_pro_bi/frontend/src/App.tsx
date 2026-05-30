import { useState, useEffect, useMemo } from 'react';
import AppShell from './components/AppShell';
import UploadZone from './components/UploadZone';
import Dashboard from './components/Dashboard';
import BoletinPanel from './components/BoletinPanel';
import CentroSelector from './components/CentroSelector';
import ProcessingOverlay from './components/ProcessingOverlay';
import ChatPanel from './components/ChatPanel';
import type { MetricsResponse } from './types';
import { isTauriRuntime } from './tauriRuntime';

type Theme = 'dark' | 'light';

// ── Feature card ──────────────────────────────────────────────
function FeatureCard({ imageSrc, imageAlt, title, description }: {
  imageSrc: string; imageAlt: string; title: string; description: string;
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

const FEATURES = [
  {
    imageSrc: '/assets/formatos-soportados.png',
    imageAlt: '',
    title: 'Integración con Excel',
    description: 'Soporte para .xlsx y .xls con varias hojas y detección orientada a columnas de producción.',
  },
  {
    imageSrc: '/assets/graficos-interactivos.png',
    imageAlt: '',
    title: 'Visualización ejecutiva',
    description: 'Gráficos y tablas para producción por máquina, horas por área, eficiencia y uso de recursos.',
  },
  {
    imageSrc: '/assets/datos-a-escala.png',
    imageAlt: '',
    title: 'KPIs operativos',
    description: 'Resumen de órdenes, personal, máquinas y contraste productivo frente a improductivo.',
  },
];

// ── App principal ─────────────────────────────────────────────
export default function App() {
  const [data, setData]               = useState<MetricsResponse | null>(null);
  const [productionPath, setProductionPath] = useState<string | null>(null);
  const [centroSel, setCentroSel]     = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [theme, setTheme]             = useState<Theme>(
    () => (localStorage.getItem('theme') as Theme) || 'dark'
  );

  // Aplicar tema al <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Bloquear drag nativo de WebView2
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const block = (e: DragEvent) => e.preventDefault();
    document.addEventListener('dragover', block);
    document.addEventListener('drop', block);
    return () => {
      document.removeEventListener('dragover', block);
      document.removeEventListener('drop', block);
    };
  }, []);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

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

  const showDevHint = import.meta.env.DEV && !isTauriRuntime();

  const latestPeriodo = useMemo(() => {
    if (!data) return '';
    const periods = data.metrics.global.ooe_mensual;
    if (!periods.length) return '';
    const last = [...periods].sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
    const [yy, mm] = last.periodo.split('-');
    const y = Number(yy), mNum = Number(mm);
    if (!Number.isFinite(y) || !Number.isFinite(mNum) || mNum < 1 || mNum > 12) return '';
    return new Date(y, mNum - 1, 1)
      .toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
      .toUpperCase();
  }, [data]);

  // ── Subpaneles del sidebar ──────────────────────────────────
  const sidebarPanel = data != null ? (
    <>
      <p className="sidebar-section-title">Filtros</p>
      <CentroSelector data={data} value={centroSel} onChange={setCentroSel} />
      <p className="sidebar-section-title">Reportes</p>
      <BoletinPanel productionPath={productionPath} defaultPeriodo={latestPeriodo || undefined} />
    </>
  ) : null;

  const sidebarFooter = (
    <span>DataDash Pro BI &mdash; Escritorio</span>
  );

  // ── TopBar ──────────────────────────────────────────────────
  const topBar = (
    <div className="app-topbar" role="banner">
      {data && (
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Volver al inicio
        </button>
      )}

      <button
        type="button"
        className="btn btn--ghost"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      >
        {theme === 'dark' ? (
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────
  return (
    <>
      <AppShell
        variant={data ? 'dashboard' : 'welcome'}
        sidebarPanel={sidebarPanel}
        sidebarFooter={sidebarFooter}
      >
        {topBar}

        {!data ? (
          <div className="welcome-corp">

            {showDevHint && (
              <div className="dev-browser-banner" role="status">
                <strong>Estás en el navegador (solo vista previa de Vite)</strong>
                Para elegir o soltar archivos Excel necesita la{' '}
                <strong>ventana de escritorio</strong> &quot;DataDash Pro BI&quot; que abre al
                ejecutar <code>npm run tauri:dev</code> en la raíz del proyecto.
              </div>
            )}

            {/* ── Hero 2 columnas ── */}
            <div className="welcome-corp__hero">

              {/* Izquierda — branding + descripción + chips */}
              <div className="welcome-corp__left">
                <p className="welcome-corp__eyebrow">
                  <span className="welcome-corp__eyebrow-dot" />
                  Análisis de producción industrial
                </p>

                <h1 className="welcome-corp__title">
                  Inteligencia<br />
                  <em className="welcome-corp__title-accent">operativa</em><br />
                  en tiempo real
                </h1>

                <p className="welcome-corp__desc">
                  Analice reportes Printux con gráficos ejecutivos, KPIs
                  automatizados y un asistente de IA completamente local.
                  Sin envío de datos a la nube, sin configuraciones complejas.
                </p>

                <div className="welcome-corp__chips">
                  {[
                    ['📊', 'KPIs y OEE automático'],
                    ['📄', 'Boletines PDF / Excel'],
                    ['🤖', 'Asistente IA local'],
                    ['🔒', '100% privado'],
                    ['⚡', 'Sin internet'],
                  ].map(([icon, label]) => (
                    <span key={label} className="welcome-corp__chip">
                      <span aria-hidden>{icon}</span>{label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Derecha — logo animado + upload */}
              <div className="welcome-corp__right">
                <div className="welcome-corp__icon-ring">
                  <img
                    src="/assets/icono-llm.png"
                    alt="DataDash Pro BI — Asistente IA"
                    className="welcome-corp__icon-img"
                  />
                </div>
                <div className="welcome-corp__upload-wrap">
                  <UploadZone
                    onSuccess={onUploadSuccess}
                    onError={onUploadError}
                    setLoading={setLoading}
                  />
                </div>
              </div>

            </div>

            {loading && <ProcessingOverlay />}

            {/* ── Feature cards ── */}
            <div className="welcome-corp__features">
              {FEATURES.map(f => <FeatureCard key={f.title} {...f} />)}
            </div>

          </div>
        ) : (
          <Dashboard data={data} onReset={onReset} centroSeleccionado={centroSel} />
        )}

        {error && <div className="alert-error" role="alert">{error}</div>}
      </AppShell>

      {/* Asistente IA — widget flotante, instancia única */}
      <ChatPanel data={data} centroSeleccionado={centroSel} />
    </>
  );
}
