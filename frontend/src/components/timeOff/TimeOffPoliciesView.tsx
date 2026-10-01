import { useTranslation } from 'react-i18next';
import type { TimeOffPolicy } from '../../api';
import TableBody from '../common/TableBody';
import { CalendarIcon, DotsVerticalIcon } from '../common/Icons';
import { PolicyName } from './timeOffShared';

interface TimeOffPoliciesViewProps {
  policies: TimeOffPolicy[];
  filter: 'active' | 'inactive';
  onFilter: (filter: 'active' | 'inactive') => void;
  assignedCount: (policyId: string) => number;
  onOpenPolicy: (policy: TimeOffPolicy) => void;
  onOpenMenu: (anchor: HTMLElement, policy: TimeOffPolicy) => void;
  onAdd: () => void;
}

// "Policies" — replaces Policies + Assignments: who a policy applies to now lives in the
// policy's own panel (PolicyDetailBody) instead of a separate employee × policy grid.
export default function TimeOffPoliciesView({ policies, filter, onFilter, assignedCount, onOpenPolicy, onOpenMenu, onAdd }: TimeOffPoliciesViewProps) {
  const { t } = useTranslation('tasks');
  const rows = policies.filter((p) => (filter === 'active' ? p.isActive : !p.isActive));
  const activeCount = policies.filter((p) => p.isActive).length;

  return (
    <div className="to-view">
      <div className="to-head">
        <div>
          <h2 className="to-title">{t('timeOff.nav.policies')}</h2>
          <p className="to-subtitle">{t('timeOff.policyDetail.subtitle')}</p>
        </div>
      </div>

      {policies.length > 0 && (
        <div className="mini-toggle-row">
          <button type="button" className={`mini-toggle-opt ${filter === 'active' ? 'active' : ''}`} onClick={() => onFilter('active')}>
            {t('timeOff.policies.activeCount', { count: activeCount })}
          </button>
          <button type="button" className={`mini-toggle-opt ${filter === 'inactive' ? 'active' : ''}`} onClick={() => onFilter('inactive')}>
            {t('timeOff.policies.deactivatedCount', { count: policies.length - activeCount })}
          </button>
        </div>
      )}

      <div className="full-table-wrap">
        <table className="table full-table !mt-0 to-table">
          <thead>
            <tr>
              <th>{t('timeOff.policyDetail.columns.policy')}</th>
              <th>{t('timeOff.policyDetail.columns.days')}</th>
              <th>{t('timeOff.policyDetail.columns.approval')}</th>
              <th>{t('timeOff.policyDetail.columns.pay')}</th>
              <th>{t('timeOff.policyDetail.columns.assigned')}</th>
              <th aria-label={t('timeOff.policies.actionsTitle')} />
            </tr>
          </thead>
          <TableBody
            colSpan={6}
            isEmpty={rows.length === 0}
            empty={
              policies.length === 0
                ? { icon: <CalendarIcon />, title: t('timeOff.policies.emptyState.title'), body: t('timeOff.policies.emptyState.body') }
                : { title: filter === 'active' ? t('timeOff.policies.noActive') : t('timeOff.policies.noDeactivated') }
            }
            onAdd={onAdd}
            addLabel={t('timeOff.policyDetail.newPolicy')}
          >
            {rows.map((p) => (
              <tr
                key={p.id}
                className={`to-row ${p.isActive ? '' : 'table-row-inactive'}`}
                tabIndex={0}
                onClick={() => onOpenPolicy(p)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onOpenPolicy(p);
                  }
                }}
              >
                <td>
                  <PolicyName name={p.name} color={p.color} />
                </td>
                <td className="num">{p.daysPerYear}</td>
                <td>{p.requiresApproval ? t('timeOff.common.yes') : t('timeOff.common.no')}</td>
                <td>{p.isPaid ? t('timeOff.policyDetail.paid') : t('timeOff.policyDetail.unpaid')}</td>
                <td className="to-muted num">{t('timeOff.policyDetail.assignedCount', { count: assignedCount(p.id) })}</td>
                <td>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMenu(e.currentTarget, p);
                    }}
                    aria-label={t('timeOff.policies.actionsForAria', { name: p.name })}
                    title={t('timeOff.policies.actionsTitle')}
                  >
                    <DotsVerticalIcon />
                  </button>
                </td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
