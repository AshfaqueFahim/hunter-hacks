'use client';

import { useI18n, LOCALES, type Locale } from '@/lib/i18n';
import { trackLanguageChanged } from '@/lib/analytics';

/**
 * Compact language selector — lives in the sticky header of every page so
 * the language can be changed from anywhere in the app.
 */
export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{t('nav.language')}</span>
      <svg
        aria-hidden
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="text-muted"
      >
        <circle cx="8" cy="8" r="6.4" />
        <path d="M1.8 8h12.4M8 1.6c-4.5 4.3-4.5 8.5 0 12.8M8 1.6c4.5 4.3 4.5 8.5 0 12.8" />
      </svg>
      <select
        value={locale}
        onChange={(e) => {
          setLocale(e.target.value as Locale);
          trackLanguageChanged(e.target.value);
        }}
        className="rounded-md border border-rule bg-bone px-2 py-1 text-xs font-medium text-secondary hover:border-rule-strong focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/25 cursor-pointer"
        aria-label={t('nav.language')}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
