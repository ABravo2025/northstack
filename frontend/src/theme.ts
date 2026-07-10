export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'northstack-theme';

export function getStoredThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyThemePreference(preference: ThemePreference) {
  const isDark = preference === 'dark' || (preference === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', isDark);
}

export function setThemePreference(preference: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, preference);
  applyThemePreference(preference);
}

export function initTheme() {
  const preference = getStoredThemePreference();
  applyThemePreference(preference);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredThemePreference() === 'system') {
      applyThemePreference('system');
    }
  });
}
