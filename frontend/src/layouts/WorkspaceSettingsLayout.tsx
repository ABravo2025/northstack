import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function WorkspaceSettingsLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isIndex = pathname === '/settings' || pathname === '/settings/';

  return (
    <div className="page-full">
      {isIndex && <h2 className="mb-5 text-xl font-semibold">{t('ui.settingsTitle')}</h2>}
      <div className="settings-content">
        <Outlet />
      </div>
    </div>
  );
}
