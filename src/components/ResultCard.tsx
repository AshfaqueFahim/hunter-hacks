'use client';

import type { Verdict } from '@/lib/stabilization';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages/en';

type Props = {
  verdict: Verdict;
  address: string;
};

const STATUS_CONFIG: Record<
  Verdict['status'],
  { accent: string; pillBg: string; pillText: string; badge: MessageKey; headline: MessageKey; sub: MessageKey }
> = {
  likely_stabilized: {
    accent: 'text-verdigris',
    pillBg: 'bg-verdigris',
    pillText: 'text-white',
    badge: 'result.stabilized.badge',
    headline: 'result.stabilized.headline',
    sub: 'result.stabilized.sub',
  },
  not_listed: {
    accent: 'text-warning',
    pillBg: 'bg-warning',
    pillText: 'text-white',
    badge: 'result.notListed.badge',
    headline: 'result.notListed.headline',
    sub: 'result.notListed.sub',
  },
  unknown: {
    accent: 'text-warning',
    pillBg: 'bg-warning',
    pillText: 'text-white',
    badge: 'result.unknown.badge',
    headline: 'result.unknown.headline',
    sub: 'result.unknown.sub',
  },
};

export default function ResultCard({ verdict, address }: Props) {
  const { t } = useI18n();
  const config = STATUS_CONFIG[verdict.status];
  const [primaryAddr, ...rest] = address.split(',');
  const tail = rest.join(',').trim();

  return (
    <section className="paper relative overflow-hidden animate-fade-in-up">
      {/* Top architectural strip */}
      <div className={`absolute inset-x-0 top-0 h-[3px] ${config.pillBg}`} />
      <div className="px-6 sm:px-8 pt-6 pb-7">
        {/* Phones: badge sits above the headline so it can't squeeze it. */}
        <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="eyebrow">{t('result.eyebrow')}</span>
              <span className="h-px w-8 bg-rule" />
              <span className="text-[11px] text-muted font-mono">BBL {verdict.bbl}</span>
            </div>
            <h2 className="mt-2 font-display text-[26px] sm:text-[30px] leading-[1.15] tracking-tight text-ink-text">
              {t(config.headline)}
            </h2>
            <p className="mt-2 text-sm text-secondary max-w-xl">{t(config.sub)}</p>
            <p className="mt-3 font-display italic text-sm text-secondary">
              <span className="text-ink-text font-medium not-italic">{primaryAddr}</span>
              {tail && <span className="text-muted">, {tail}</span>}
            </p>
          </div>
          <span
            className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${config.pillBg} ${config.pillText}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {t(config.badge)}
          </span>
        </div>

        {verdict.status !== 'unknown' && (
          <>
            <div className="my-5 rule" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <DataPoint
                label={t('result.onDhcrList')}
                value={verdict.on_dhcr_list_latest ? t('common.yes') : t('common.no')}
                tone={verdict.on_dhcr_list_latest ? 'verdigris' : 'muted'}
              />
              {verdict.source_year_max !== undefined && (
                <DataPoint label={t('result.recentEvidence')} value={String(verdict.source_year_max)} />
              )}
            </dl>
          </>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <a
            href={verdict.dhcr_verify_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-rule bg-bone px-3 py-2 text-sm font-medium text-ink-text hover:border-brass hover:bg-brass-wash hover:text-brass-deep"
          >
            {t('result.verifyDhcr')}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 9l6-6M5 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a
            href="https://hcr.ny.gov/records-access"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-rule bg-bone px-3 py-2 text-sm font-medium text-ink-text hover:border-brass hover:bg-brass-wash hover:text-brass-deep"
          >
            {t('result.requestRec1')}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 9l6-6M5 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-muted">
          {t('result.disclaimer')}
        </p>
      </div>
    </section>
  );
}

function DataPoint({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'verdigris' | 'muted';
}) {
  const valueClass =
    tone === 'verdigris' ? 'text-verdigris' : tone === 'muted' ? 'text-muted' : 'text-ink-text';
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 font-display text-[22px] leading-none tabular ${valueClass}`}>{value}</dd>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
