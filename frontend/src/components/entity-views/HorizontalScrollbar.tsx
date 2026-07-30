import { useEffect, useRef, useState } from 'react';

interface HorizontalScrollbarProps {
  targetRef: React.RefObject<HTMLElement>;
}

// Custom horizontal scrollbar for .full-table-wrap — the native one is thin
// and looks different per OS/browser. Reads/drives the real scroll position
// of `targetRef` so native scroll (trackpad, Shift+wheel, arrow keys) and
// dragging this thumb stay in sync in both directions.
export default function HorizontalScrollbar({ targetRef }: HorizontalScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const update = () => {
      setMetrics({ scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    };
    update();

    el.addEventListener('scroll', update);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', handleWheel);
      resizeObserver.disconnect();
    };
  }, [targetRef]);

  const { scrollLeft, scrollWidth, clientWidth } = metrics;
  const canScroll = scrollWidth > clientWidth + 1;

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const el = targetRef.current;
      const track = trackRef.current;
      if (!el || !track) return;
      const trackWidth = track.clientWidth;
      const thumbWidth = Math.max((clientWidth / scrollWidth) * trackWidth, 24);
      const maxThumbLeft = trackWidth - thumbWidth;
      const trackRect = track.getBoundingClientRect();
      const rawThumbLeft = e.clientX - trackRect.left - thumbWidth / 2;
      const thumbLeft = Math.min(Math.max(rawThumbLeft, 0), maxThumbLeft);
      const maxScrollLeft = scrollWidth - clientWidth;
      el.scrollLeft = maxThumbLeft > 0 ? (thumbLeft / maxThumbLeft) * maxScrollLeft : 0;
    };
    const handleMouseUp = () => setDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, targetRef, scrollWidth, clientWidth]);

  if (!canScroll) return null;

  const trackWidth = trackRef.current?.clientWidth ?? 0;
  const thumbWidthPx = trackWidth ? Math.max((clientWidth / scrollWidth) * trackWidth, 24) : 0;
  const maxThumbLeft = trackWidth - thumbWidthPx;
  const maxScrollLeft = scrollWidth - clientWidth;
  const thumbLeftPx = maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * maxThumbLeft : 0;

  const handleTrackClick = (e: React.MouseEvent) => {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track || e.target !== track) return;
    const trackRect = track.getBoundingClientRect();
    const clickX = e.clientX - trackRect.left;
    const targetThumbLeft = Math.min(Math.max(clickX - thumbWidthPx / 2, 0), maxThumbLeft);
    el.scrollLeft = maxThumbLeft > 0 ? (targetThumbLeft / maxThumbLeft) * maxScrollLeft : 0;
  };

  return (
    <div ref={trackRef} className="hscrollbar-track" onMouseDown={handleTrackClick}>
      <div
        className={`hscrollbar-thumb ${dragging ? 'dragging' : ''}`}
        style={{ width: thumbWidthPx, left: thumbLeftPx }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
      />
    </div>
  );
}
