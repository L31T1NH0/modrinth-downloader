'use client';

import { useSyncExternalStore } from 'react';
import {
  detectLocaleFromLanguage,
  getTranslations,
  defaultTranslations,
  type Locale,
  type Translations,
} from '@/lib/i18n-core';

export type { Translations } from '@/lib/i18n-core';

function detectLocale(): Locale {
  return detectLocaleFromLanguage(navigator.language);
}

// Locale never changes at runtime, so no subscription is needed.
const emptySubscribe = () => () => {};

/**
 * Returns the translation object for the user's browser language.
 * Uses useSyncExternalStore so the correct locale is read on the first
 * client render with no extra re-render, while the server snapshot
 * safely falls back to English to avoid hydration mismatches.
 */
export function useLocale(): Translations {
  return useSyncExternalStore(
    emptySubscribe,
    () => getTranslations(detectLocale()),
    () => defaultTranslations,
  );
}
