import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
}

// Renders into a portal on <body> instead of positioning relative to its
// trigger in-place — a trigger that lives inside a horizontally scrolling
// row (e.g. ViewsBar) forces overflow-y to clip too (CSS quirk: overflow-x
// != visible coerces overflow-y away from visible), which silently clips
// any in-flow absolutely-positioned popover and leaves only its scrollbar
// visible. Positioning via the trigger's real screen coordinates sidesteps
// that entirely.
export default function Popover({ open, onClose, anchorRef, children, align = 'left', width = 260 }: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Recompute continuously (not just once on open) so the popover stays aligned
  // with its trigger through layout shifts that don't fire a window `resize`
  // event — e.g. the sidebar collapsing/expanding animates its width via CSS,
  // which reflows everything to its right without changing window dimensions.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPosition(null);
      return;
    }
    let frame: number;
    const track = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const left = align === 'right' ? rect.right - width : rect.left;
      const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - width - 8));

      // Only horizontal clamping existed before — fine while every Popover
      // trigger lived near the top of the page (table headers/toolbars). The
      // Tasks "+ Add task" ghost row (EntityTasksList) can sit near the
      // bottom of a long, scrollable detail modal, where `rect.bottom + 6`
      // pushes the panel below the viewport entirely. Flip to opening above
      // the anchor when there isn't room below; on the very first frame the
      // panel hasn't rendered yet (height reads 0) and briefly opens below by
      // default, self-correcting next frame once popoverRef has a real size.
      const panelHeight = popoverRef.current?.offsetHeight ?? 0;
      let top = rect.bottom + 6;
      if (panelHeight > 0 && top + panelHeight > window.innerHeight - 8) {
        const openAbove = rect.top - 6 - panelHeight;
        top = openAbove >= 8 ? openAbove : Math.max(8, window.innerHeight - panelHeight - 8);
      }

      const next = { top, left: clampedLeft };
      setPosition((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [open, anchorRef, align, width]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      // A nested Popover (e.g. ColorPicker opened from inside this one) portals
      // to document.body independently, so its content isn't a DOM descendant
      // of popoverRef — without this check, a click inside it reads as
      // "outside" and closes this popover before the nested one can act on it.
      if (target instanceof Element && target.closest('.popover-panel')) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Stop the Escape from also reaching a parent modal's own Escape
      // listener (e.g. EmployeeOverviewPanel/CompanyDetailModal each close on
      // Escape too, listening on window) — without this, opening a Popover
      // from inside one of those and pressing Escape closed both layers at
      // once instead of just the popover on top.
      e.stopPropagation();
      onClose();
    };
    const handleScroll = (e: Event) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.popover-panel')) return;
      // The tracking loop above already keeps the popover glued to its anchor
      // through a scroll (a scrollable modal body, the sidebar collapsing,
      // etc.) — closing unconditionally here fought that: e.g. filling a
      // field inside the popover made the browser auto-scroll it into view,
      // which then closed the very popover being filled in. Only close if the
      // anchor has scrolled fully out of view — there's nothing sensible left
      // to point the popover at.
      if (anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        const anchorStillVisible = rect.bottom > 0 && rect.top < window.innerHeight;
        if (anchorStillVisible) return;
      }
      onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="popover-panel"
      style={{ position: 'fixed', top: position.top, left: position.left, width, margin: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}
