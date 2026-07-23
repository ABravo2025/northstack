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
      const next = { top: rect.bottom + 6, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) };
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
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = (e: Event) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.popover-panel')) return;
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
