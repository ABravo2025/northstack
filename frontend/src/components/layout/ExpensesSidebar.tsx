import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, CreditCardIcon, DashboardIcon, ListIcon, ReceiptIcon, TrendingIcon, UploadIcon, XIcon } from '../common/Icons';

interface ExpensesSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// Gastos / Expenses (spec-clientes-gastos-formularios.md, A5): swapped in for the main Sidebar
// anywhere under /expenses (see AppLayout.tsx), same mechanism as PayrollSidebar.
export default function ExpensesSidebar({ mobileOpen, onMobileClose }: ExpensesSidebarProps) {
  const { t } = useTranslation('expenses');
  const navigate = useNavigate();
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
          <NavLink to="/expenses" end className={linkClass} onClick={onMobileClose}>
            <DashboardIcon className="h-4 w-4 shrink-0" />
            {t('nav.summary')}
          </NavLink>
          <NavLink to="/expenses/movements" className={linkClass} onClick={onMobileClose}>
            <ListIcon className="h-4 w-4 shrink-0" />
            {t('nav.movements')}
          </NavLink>
          <NavLink to="/expenses/fixed" className={linkClass} onClick={onMobileClose}>
            <ReceiptIcon className="h-4 w-4 shrink-0" />
            {t('nav.fixed')}
          </NavLink>
          <NavLink to="/expenses/accounts" className={linkClass} onClick={onMobileClose}>
            <CreditCardIcon className="h-4 w-4 shrink-0" />
            {t('nav.accounts')}
          </NavLink>
          <NavLink to="/expenses/cashflow" className={linkClass} onClick={onMobileClose}>
            <TrendingIcon className="h-4 w-4 shrink-0" />
            {t('nav.cashflow')}
          </NavLink>
          <NavLink to="/expenses/import" className={linkClass} onClick={onMobileClose}>
            <UploadIcon className="h-4 w-4 shrink-0" />
            {t('nav.import')}
          </NavLink>
        </div>
      </aside>
    </>
  );
}
