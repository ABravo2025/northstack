import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import commonEn from '../locales/en/common.json';
import commonEs from '../locales/es/common.json';
import dashboardsEn from '../locales/en/dashboards.json';
import dashboardsEs from '../locales/es/dashboards.json';
import crmEn from '../locales/en/crm.json';
import crmEs from '../locales/es/crm.json';
import hrEn from '../locales/en/hr.json';
import hrEs from '../locales/es/hr.json';
import tasksEn from '../locales/en/tasks.json';
import tasksEs from '../locales/es/tasks.json';
import settingsPagesEn from '../locales/en/settingsPages.json';
import settingsPagesEs from '../locales/es/settingsPages.json';
import notesActivityEn from '../locales/en/notesActivity.json';
import notesActivityEs from '../locales/es/notesActivity.json';
import authEn from '../locales/en/auth.json';
import authEs from '../locales/es/auth.json';
import projectsEn from '../locales/en/projects.json';
import projectsEs from '../locales/es/projects.json';

// docs/general/spec-i18n.md — only these two for now; the detector/fallback chain below doesn't
// need to change to add a third later.
export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEn,
        dashboards: dashboardsEn,
        crm: crmEn,
        hr: hrEn,
        tasks: tasksEn,
        settingsPages: settingsPagesEn,
        notesActivity: notesActivityEn,
        auth: authEn,
        projects: projectsEn,
      },
      es: {
        common: commonEs,
        dashboards: dashboardsEs,
        crm: crmEs,
        hr: hrEs,
        tasks: tasksEs,
        settingsPages: settingsPagesEs,
        notesActivity: notesActivityEs,
        auth: authEs,
        projects: projectsEs,
      },
    },
    supportedLngs: SUPPORTED_LOCALES,
    // es-AR, es-MX, en-GB… count as their base language (2026-10-05): without this an Argentine
    // browser (es-AR) fell back to English on every screen before login.
    nonExplicitSupportedLngs: true,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });

export default i18n;
