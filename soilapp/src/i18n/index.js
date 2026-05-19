// src/i18n/index.js — i18next setup for MittiCard
// Supports: English (en) and Hindi (hi)
// Language is loaded from AsyncStorage on app start
// Default: Hindi (most farmers prefer it)

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import hi from './hi.json';

// All translation files loaded here
// To add more languages later (e.g. Marathi):
//   1. Create mr.json with the same keys
//   2. import mr from './mr.json'
//   3. Add mr: { translation: mr } below
const resources = {
  en: { translation: en },
  hi: { translation: hi },
};

i18n
  .use(initReactI18next)   // connects i18next to React hooks (useTranslation)
  .init({
    resources,
    lng: 'hi',             // default language is Hindi
    fallbackLng: 'en',     // if a key is missing in Hindi, show English
    interpolation: {
      escapeValue: false,  // React already escapes values — no double-escaping needed
    },
    compatibilityJSON: 'v3', // required when bundled with Metro (React Native)
  });

export default i18n;

// ─── Helper: change language at runtime ────────────────────────────────────────
// Call this after reading saved language from AsyncStorage
// or when user picks a language from LanguageScreen
export const changeLanguage = (langCode) => {
  // langCode: 'en' or 'hi'
  return i18n.changeLanguage(langCode);
};
