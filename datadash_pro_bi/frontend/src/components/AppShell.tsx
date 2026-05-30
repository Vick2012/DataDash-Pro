import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  sidebarFooter?: ReactNode;
  sidebarPanel?: ReactNode;
  variant?: 'welcome' | 'dashboard';
}

const WELCOME_ITEMS = [
  { icon: '📊', title: 'KPIs en tiempo real',   desc: 'OEE, PPH y eficiencia calculados automáticamente.' },
  { icon: '📄', title: 'Boletines PDF / Excel', desc: 'Reportes individuales por colaborador.' },
  { icon: '🤖', title: 'Asistente IA local',    desc: 'Consultas en lenguaje natural sobre los datos.' },
];

const SidebarWelcome = () => (
  <div className="sidebar-welcome">
    {WELCOME_ITEMS.map(({ icon, title, desc }) => (
      <div key={title} className="sidebar-welcome-card">
        <span className="sidebar-welcome-card__icon" aria-hidden>{icon}</span>
        <div>
          <p className="sidebar-welcome-card__title">{title}</p>
          <p className="sidebar-welcome-card__desc">{desc}</p>
        </div>
      </div>
    ))}
  </div>
);

export default function AppShell({
  children,
  sidebarFooter,
  sidebarPanel,
  variant = 'welcome',
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label="Navegación principal">

        {/* Brand */}
        <div className="app-shell__brand">
          <div className="app-shell__logo-mark" aria-hidden>
            <img src="/assets/icono-bi.png" alt="DataDash Pro BI logo" width={40} height={40} className="app-shell__logo-img" />
          </div>
          <div className="app-shell__brand-text">
            <span className="app-shell__brand-name">DataDash Pro BI</span>
            <span className="app-shell__brand-tag">Institutional Monitor</span>
          </div>
        </div>

        {/* Panel slot — siempre flex:1 para empujar meta al fondo */}
        <div className="app-shell__sidebar-panel-slot">
          {sidebarPanel ?? <SidebarWelcome />}
        </div>

        {/* Meta — siempre al fondo */}
        <div className="app-shell__sidebar-meta">
          <span className="app-shell__badge">Procesamiento local</span>
          <p className="app-shell__sidebar-note">
            Los datos no salen de este equipo. Ideal para entornos de producción
            con políticas de información sensible.
          </p>
        </div>

        {sidebarFooter ? <div className="app-shell__sidebar-footer">{sidebarFooter}</div> : null}

      </aside>

      <div className="app-shell__main-wrap">
        <main className={`app-shell__main app-shell__main--${variant}`}>{children}</main>
      </div>
    </div>
  );
}
