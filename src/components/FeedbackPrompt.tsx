'use client';

import { useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { trackFeedback } from '@/lib/analytics';

type Props = {
  context: 'verdict' | 'draft';
  className?: string;
};

type EmailState = 'idle' | 'sending' | 'sent' | 'error';

/**
 * "Was this useful?" yes/no, plus an optional "can we contact you?" email.
 * The yes/no goes to Umami as an event with no other properties; the email
 * goes only to /api/feedback, which stores it without any address or BBL.
 */
export default function FeedbackPrompt({ context, className = '' }: Props) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState(false);
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState<EmailState>('idle');

  function answer(useful: boolean) {
    trackFeedback(context, useful);
    setAnswered(true);
  }

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailState('sending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), context }),
      });
      setEmailState(res.ok ? 'sent' : 'error');
    } catch {
      setEmailState('error');
    }
  }

  return (
    <div className={`rounded-[10px] border border-rule bg-paper-soft px-4 py-3 ${className}`}>
      {!answered ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-secondary">{t('feedback.question')}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => answer(true)} className="btn-ghost px-3 py-1.5 text-sm">
              {t('common.yes')}
            </button>
            <button type="button" onClick={() => answer(false)} className="btn-ghost px-3 py-1.5 text-sm">
              {t('common.no')}
            </button>
          </div>
        </div>
      ) : emailState === 'sent' ? (
        <p className="text-sm text-secondary">{t('feedback.sent')}</p>
      ) : (
        <form onSubmit={submitEmail} className="space-y-2">
          <p className="text-sm text-ink-text">{t('feedback.thanks')}</p>
          <label className="block text-[12px] text-secondary" htmlFor={`feedback-email-${context}`}>
            {t('feedback.contactLabel')}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={`feedback-email-${context}`}
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('feedback.emailPh')}
              className="min-w-0 flex-1 rounded-[10px] border border-rule bg-bone px-3 py-2 text-sm text-ink-text placeholder:text-muted/70 focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/25"
            />
            <button
              type="submit"
              disabled={emailState === 'sending' || !email.trim()}
              className="btn-brass px-4 py-2 text-sm disabled:opacity-60"
            >
              {emailState === 'sending' ? t('feedback.sending') : t('feedback.send')}
            </button>
          </div>
          {emailState === 'error' && <p className="text-[12px] text-warning">{t('feedback.error')}</p>}
          <p className="text-[11px] text-muted">{t('feedback.privacy')}</p>
        </form>
      )}
    </div>
  );
}
