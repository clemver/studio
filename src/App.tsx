import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { StudioProvider, useStudio } from './state/studio';
import { Sidebar } from './components/Sidebar';
import type { NavPage } from './components/Sidebar';
import { Icon } from './components/Icons';
import { TooltipLayer } from './components/Tooltip';
import { ErrorBanner } from './components/ErrorBanner';
import { ExplorerPage } from './pages/ExplorerPage';
import { ReportsPage } from './pages/ReportsPage';
import { CustomSeriesPage } from './pages/CustomSeriesPage';
import { DashboardPage } from './pages/DashboardPage';
import { UploadPage } from './pages/UploadPage';
import { USE_MOCK } from './api';
import { setMockLevel, setMockRole } from './api/mock';
import type { Level } from './types';
import type { Permission } from './lib/permissions';
import { PROFILE_LIST, profileLabel, roleLabel } from './lib/permissions';

/** Each page needs one permission (config/permissions.json). */
const PAGES: (NavPage & { need: Permission })[] = [
  { path: '/explorer', label: 'Explorer', icon: <Icon.explorer />, need: 'explorer.view' },
  { path: '/dashboard', label: 'Dashboard', icon: <Icon.dashboard />, need: 'dashboard.view' },
  { path: '/reports', label: 'Reports', icon: <Icon.reports />, need: 'reports.view' },
  { path: '/custom', label: 'Custom series', icon: <Icon.custom />, need: 'custom.manage' },
  { path: '/upload', label: 'Excel import', icon: <Icon.upload />, need: 'import.excel' },
];

function Shell() {
  const s = useStudio();
  const loc = useLocation();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [loc.pathname]);

  // The sidebar hides pages the user may not open; routing redirects them to the explorer.
  const pages = PAGES.filter(p => s.can(p.need));
  const current = PAGES.find(p => loc.pathname.startsWith(p.path)) ?? PAGES[0];

  const focusSearch = () => {
    navigate('/explorer');
    // The explorer's search field opens from its magnifier button.
    setTimeout(() => { const q = document.getElementById('cq'); if (q) q.focus(); else document.querySelector<HTMLElement>('.gx-hd [aria-label="Search instruments"]')?.click(); }, 30);
  };
  const switchLevel = (l: Level) => {
    setMockLevel(l);
    s.reloadMe();
    const p = PROFILE_LIST.find(x => x.id === l);
    s.showToast(`${p?.label}: ${p?.description}.`);
  };
  const toggleRole = (role: string) => {
    const on = !s.me?.roles.includes(role);
    setMockRole(role, on);
    s.reloadMe();
    s.showToast(`${roleLabel(role)} ${on ? 'granted' : 'removed'}.`);
  };

  return (
    <div className={`app${drawer ? ' open' : ''}`}>
      <Sidebar pages={pages} level={s.level} notifications={s.notifications} unseen={s.unseen} onSeen={s.markSeen}
        onSearch={focusSearch} onSwitchLevel={USE_MOCK ? switchLevel : undefined}
        roles={s.me?.roles ?? []} onToggleRole={USE_MOCK ? toggleRole : undefined} />
      <div className="scrim" onClick={() => setDrawer(false)} />
      <div className="main">
        <header className="crumb">
          <button type="button" className="burger" aria-label="Open menu" title="Open menu" onClick={() => setDrawer(true)}><Icon.burger /></button>
          <button type="button" className="home" aria-label="Home" title="Home" onClick={() => navigate('/explorer')}><Icon.home /></button>
          <span className="sl">/</span><span className="app-name">Timeseries Studio</span><span className="sl app-name">/</span><span>{current.label}</span>
          {s.me && <span className="lvl">{profileLabel(s.level)}{s.me.roles.map(r => ' · ' + roleLabel(r)).join('')}</span>}
        </header>
        {s.meError ? (
          <section className="page"><ErrorBanner error={s.meError} onDismiss={() => {}} onRetry={s.reloadMe} /></section>
        ) : !s.me ? (
          <section className="page"><div className="loading">Loading your profile…</div></section>
        ) : (
          <Routes>
            <Route path="/explorer" element={<ExplorerPage />} />
            {s.can('custom.manage') && <Route path="/custom" element={<CustomSeriesPage />} />}
            {s.can('dashboard.view') && <Route path="/dashboard" element={<DashboardPage />} />}
            {s.can('import.excel') && <Route path="/upload" element={<UploadPage />} />}
            {s.can('reports.view') && <Route path="/reports" element={<ReportsPage />} />}
            <Route path="*" element={<Navigate to="/explorer" replace />} />
          </Routes>
        )}
      </div>
      <TooltipLayer />
      {s.toast && <div className="toast" role="status">{s.toast}</div>}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <StudioProvider>
        <Shell />
      </StudioProvider>
    </BrowserRouter>
  );
}
