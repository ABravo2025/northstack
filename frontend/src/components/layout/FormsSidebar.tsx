import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ClipboardIcon, ListIcon, XIcon } from '../common/Icons';

interface FormsSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// Formularios y encuestas (spec-clientes-gastos-formularios.md, B5): its own area, swapped in for
// the main Sidebar anywhere under /forms (see AppLayout.tsx), same mechanism as ExpensesSidebar.
export default function FormsSidebar({ mobileOpen, onMobileClose }: FormsSidebarProps) {
  const { t } = useTranslation('forms');
  const navigate = useNavigate();
  const location = useLocation();
  const linkClass = ({ isActive }: { isActive: boolean }) => `sidebar-link${isActive ? ' active' : ''}`;

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle-mobile" onClick={onMobileClose} aria-label={t('nav.back')}>
          <XIcon className="h-4 w-4" />
        </button>

        <div>
          <button type="button" className="sidebar-link w-full text-left" onClick={() => navigate('/overview')}>
            <ChevronLeftIcon className="h-4 w-4 shrink-0" />
            {t('nav.back')}
          </button>
        </div>

        <div className="sidebar-divider">
          <p className="sidebar-group-label">{t('nav.section')}</p>
          <NavLink
            to="/forms"
            className={({ isActive }) => linkClass({ isActive: isActive && !location.pathname.startsWith('/forms/responses') })}
            onClick={onMobileClose}
          >
            <ClipboardIcon className="h-4 w-4 shrink-0" />
            {t('nav.all')}
          </NavLink>
          <NavLink to="/forms/responses" className={linkClass} onClick={onMobileClose}>
            <ListIcon className="h-4 w-4 shrink-0" />
            {t('nav.responses')}
          </NavLink>
        </div>
      </aside>
    </>
  );
}
