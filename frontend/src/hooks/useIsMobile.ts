import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

// Same breakpoint as the app's own `@media (max-width: 767px)` CSS blocks (App.css) — kept as one
// source of truth here for the few places that need to pick between two genuinely different JSX
// trees (not just a style tweak), like the entity detail panel's unified mobile tab strip.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handleChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}
