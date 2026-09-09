import { useEffect, useState } from 'react';

// Highlights whichever section is currently in view in a left-hand doc nav — used by GuidePage
// and HelpPage. Observes against .app-main, the app's real scrolling container (App.css
// `.app-main { overflow-y-auto }`), not the window, since the viewport itself never scrolls.
export function useScrollSpy(ids: string[]): string {
  const [activeId, setActiveId] = useState(ids[0] ?? '');
  const key = ids.join(',');

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.app-main');
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { root, rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return activeId;
}
