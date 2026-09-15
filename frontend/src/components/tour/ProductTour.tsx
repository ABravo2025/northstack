import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useToast } from '../common/ToastProvider';
import { api } from '../../api';
import { XIcon } from '../common/Icons';

interface TourStep {
  id: string;
  // null selector = centered card (welcome/finish), no spotlight.
  selector: string | null;
  title: string;
  body: string;
  requiresSales?: boolean;
}

const ALL_STEPS: TourStep[] = [
  {
    id: 'welcome',
    selector: null,
    title: 'Welcome to Northstack',
    body: "Take a 60-second look around before you dive in — the sidebar, notifications, and where to find help.",
  },
  {
    id: 'nav-overview',
    selector: '[data-tour="nav-overview"]',
    title: 'Your home base',
    body: 'This is Overview — tasks, time off, and your calendar all in one place.',
  },
  {
    id: 'nav-hr',
    selector: '[data-tour="nav-hr"]',
    title: 'Manage your team',
    body: 'Employees and time off live here.',
  },
  {
    id: 'nav-sales',
    selector: '[data-tour="nav-sales"]',
    title: 'Track your pipeline',
    body: 'Companies, contacts, and deals — everything Sales needs.',
    requiresSales: true,
  },
  {
    id: 'topbar-bell',
    selector: '[data-tour="topbar-bell"]',
    title: "You'll get notified here",
    body: 'Deal updates, time off requests, and teammate approvals all land in this bell.',
  },
  {
    id: 'topbar-usermenu',
    selector: '[data-tour="topbar-usermenu"]',
    title: 'Guide, help, and replay',
    body: "Stuck later? The full guide and FAQ live here — and you can replay this tour anytime from the same menu.",
  },
  {
    id: 'nav-settings',
    selector: '[data-tour="nav-settings"]',
    title: 'Your workspace controls',
    body: 'Roles, billing, integrations, and company settings all live here.',
  },
  {
    id: 'finish',
    selector: null,
    title: "You're all set",
    body: 'Want to start adding your real data, or explore with sample data first?',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPosition {
  top: number;
  left: number;
}

const TOOLTIP_WIDTH = 280;
const TOOLTIP_HEIGHT_ESTIMATE = 170;
const VIEWPORT_MARGIN = 12;

function positionTooltip(rect: Rect): TooltipPosition {
  let top = rect.top + rect.height + VIEWPORT_MARGIN;
  if (top + TOOLTIP_HEIGHT_ESTIMATE > window.innerHeight) {
    top = Math.max(VIEWPORT_MARGIN, rect.top - TOOLTIP_HEIGHT_ESTIMATE - VIEWPORT_MARGIN);
  }
  let left = rect.left;
  if (left + TOOLTIP_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
    left = window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN;
  }
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  return { top, left };
}

interface ProductTourProps {
  token: string;
  user: any;
  // Bumped by TopBar's "Take the tour again" menu item — a plain counter instead of a boolean so
  // clicking it twice in a row (without the tour ever becoming inactive in between) still re-fires
  // the effect below.
  replaySignal: number;
}

// Guided spotlight tour of the real app chrome (sidebar/topbar) — built without a dependency
// (no driver.js/shepherd/react-joyride in this project) since it only needs to highlight a handful
// of already-rendered elements via their data-tour attribute. Mounted once in AppLayout, so it
// survives route navigation for as long as the authenticated shell is up. Replaces
// OnboardingChecklist.tsx entirely (2026-09-15) — see docs/tareas/Task-UxUI.md.
export default function ProductTour({ token, user, replaySignal }: ProductTourProps) {
  const permissions = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const autoCheckedRef = useRef(false);
  const rafRef = useRef<number | undefined>(undefined);

  const showSales = permissions.has('view_company') && permissions.has('view_contact');
  const steps = useMemo(() => ALL_STEPS.filter((s) => !s.requiresSales || showSales), [showSales]);

  // Auto-launch once per mount, only for a user who has never finished or skipped it before.
  useEffect(() => {
    if (autoCheckedRef.current) return undefined;
    autoCheckedRef.current = true;
    if (!user || user.productTourCompletedAt) return undefined;

    const timer = setTimeout(() => {
      setStepIndex(0);
      setActive(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [user]);

  // Manual replay from TopBar's user menu — doesn't touch productTourCompletedAt, so it never
  // affects the auto-launch check above.
  useEffect(() => {
    if (replaySignal > 0) {
      setStepIndex(0);
      setActive(true);
    }
  }, [replaySignal]);

  const step = steps[stepIndex];

  // A rAF loop rather than just resize/scroll listeners — the sidebar's own collapse toggle and
  // ordinary content reflow can move a target without firing either event, and this only runs
  // while a handful of tour steps are visible.
  useEffect(() => {
    if (!active || !step || !step.selector) {
      setRect(null);
      return;
    }
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector!);
      setRect(el ? el.getBoundingClientRect() : null);
      rafRef.current = requestAnimationFrame(measure);
    };
    measure();
    return () => {
      cancelled = true;
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [active, step]);

  const finishTour = () => {
    setActive(false);
    api.completeTour(token).catch(() => {
      // Best-effort — worst case the tour auto-launches once more on a future login.
    });
  };

  const goNext = () => {
    if (stepIndex >= steps.length - 1) {
      finishTour();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const handleAddEmployee = () => {
    finishTour();
    navigate('/hr/people');
  };

  const handleLoadSample = async () => {
    finishTour();
    try {
      const result = await api.seedSampleData(token);
      toast.success(`Added ${result.employees} sample employees and ${result.companies} sample companies.`);
    } catch (error) {
      toast.error('Failed to load sample data: ' + (error as Error).message);
    }
  };

  if (!active || !step) return null;

  if (!step.selector) {
    const isWelcome = step.id === 'welcome';
    return (
      <div className="modal-overlay tour-center-overlay">
        <div className="modal-panel tour-center-card">
          <button type="button" className="modal-close tour-close" onClick={finishTour} aria-label="Close tour">
            <XIcon className="h-4 w-4" />
          </button>
          <span className="tour-emoji">{isWelcome ? '👋' : '🎉'}</span>
          <h3 className="modal-title">{isWelcome ? `Welcome to Northstack${user?.firstName ? `, ${user.firstName}` : ''}` : step.title}</h3>
          <p className="tour-body">{step.body}</p>
          {isWelcome ? (
            <div className="tour-nav tour-nav-center">
              <button type="button" className="btn-secondary" onClick={finishTour}>
                Skip
              </button>
              <button type="button" className="btn-primary" onClick={goNext}>
                Take the tour
              </button>
            </div>
          ) : (
            <div className="tour-finish-actions">
              <button type="button" className="btn-primary" onClick={handleAddEmployee}>
                Add my first employee
              </button>
              <button type="button" className="btn-secondary" onClick={handleLoadSample}>
                Load sample data instead
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!rect) return null;

  const tooltipPos = positionTooltip(rect);
  const pad = 6;

  return (
    <div className="tour-overlay">
      <div className="tour-click-blocker" />
      <div
        className="tour-spotlight"
        style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      />
      <div className="tour-tooltip" style={{ top: tooltipPos.top, left: tooltipPos.left, width: TOOLTIP_WIDTH }}>
        <button type="button" className="modal-close tour-close" onClick={finishTour} aria-label="Close tour">
          <XIcon className="h-3.5 w-3.5" />
        </button>
        <span className="tour-step-label">
          Step {stepIndex} of {steps.length - 1}
        </span>
        <h4 className="tour-tooltip-title">{step.title}</h4>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={finishTour}>
            Skip tour
          </button>
          <div className="tour-nav">
            {stepIndex > 1 && (
              <button type="button" className="btn-secondary btn-sm" onClick={goBack}>
                Back
              </button>
            )}
            <button type="button" className="btn-primary btn-sm" onClick={goNext}>
              {stepIndex === steps.length - 2 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
