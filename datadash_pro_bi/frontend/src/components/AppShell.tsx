import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  sidebarFooter?: ReactNode;
  /** Panel extra bajo la nota (p. ej. filtro por centro en el dashboard). */
  sidebarPanel?: ReactNode;
  /** When true, main area gets wider padding for dashboard grid */
  variant?: 'welcome' | 'dashboard';
}

export default function AppShell({
  children,
  sidebarFooter,
  sidebarPanel,
  variant = 'welcome',
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label="Navegación principal">
        <div className="app-shell__brand">
          <div className="app-shell__logo-mark" aria-hidden>
            <img src="/assets/icono-bi.png" alt="DataDash Pro BI logo" width={44} height={44} className="app-shell__logo-img" />
          </div>
          <div className="app-shell__brand-text">
            <span className="app-shell__brand-name">DataDash Pro BI</span>
            <span className="app-shell__brand-tag">Institutional Monitor</span>
          </div>
        </div>
        {sidebarPanel ? <div className="app-shell__sidebar-panel-slot">{sidebarPanel}</div> : null}
        <div className="app-shell__sidebar-meta">
          <span className="app-shell__badge">Procesamiento local</span>
          <p className="app-shell__sidebar-note">
            Los datos no salen de este equipo. Ideal para entornos de producción con políticas de información
            sensible.
          </p>
        </div>
        <div className="app-shell__sidebar-spacer" aria-hidden />
        {sidebarFooter ? <div className="app-shell__sidebar-footer">{sidebarFooter}</div> : null}
      </aside>
      <div className="app-shell__main-wrap">
        <main className={`app-shell__main app-shell__main--${variant}`}>{children}</main>
      </div>
    </div>
  );
}
