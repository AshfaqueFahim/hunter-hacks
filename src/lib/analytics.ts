// Privacy-safe, cookieless usage counting via Umami.
//
// Hard rule: NEVER send addresses, BBLs, unit numbers, rent amounts or lease
// dates. The only properties that may leave the browser are `borough`,
// `result`, `language` and `useful`, each restricted to a closed set of values —
// `sanitizeProps` enforces this for every event, so a careless call site
// can't leak free text. Borough is derived locally from the BBL's first
// digit; the BBL itself is never sent.

const BOROUGHS = {
  '1': 'manhattan',
  '2': 'bronx',
  '3': 'brooklyn',
  '4': 'queens',
  '5': 'staten_island',
} as const;

export type Borough = (typeof BOROUGHS)[keyof typeof BOROUGHS];
export type VerdictResult = 'stabilized' | 'not_found' | 'error';

const ALLOWED: Record<string, ReadonlySet<string>> = {
  borough: new Set<string>(Object.values(BOROUGHS)),
  result: new Set<VerdictResult>(['stabilized', 'not_found', 'error']),
  language: new Set(['en', 'es', 'zh', 'bn']),
  useful: new Set(['yes', 'no']),
};

type Props = Partial<Record<'borough' | 'result' | 'language' | 'useful', string>>;

type UmamiWindow = { umami?: { track: (name: string, data?: Props) => void } };

export function boroughFromBbl(bbl: string | null | undefined): Borough | undefined {
  const digit = String(bbl ?? '').trim().charAt(0);
  return BOROUGHS[digit as keyof typeof BOROUGHS];
}

export function sanitizeProps(props: Record<string, unknown>): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' && ALLOWED[key]?.has(value)) {
      out[key as keyof Props] = value;
    }
  }
  return out;
}

function send(name: string, props: Record<string, unknown> = {}): void {
  try {
    if (typeof window === 'undefined') return;
    (window as unknown as UmamiWindow).umami?.track(name, sanitizeProps(props));
  } catch {
    // Analytics must never break the app.
  }
}

export function trackLookupRun(): void {
  send('lookup_run');
}

export function trackVerdictShown(bbl: string | undefined, result: VerdictResult): void {
  send('verdict_shown', { borough: boroughFromBbl(bbl), result });
}

export function trackOverchargeCalculated(bbl: string | undefined): void {
  send('overcharge_calculated', { borough: boroughFromBbl(bbl) });
}

export function trackRa89DraftGenerated(bbl: string | undefined): void {
  send('ra89_draft_generated', { borough: boroughFromBbl(bbl) });
}

export function trackLanguageChanged(language: string): void {
  send('language_changed', { language });
}

// "Was this useful?" — the answer only. Any contact email goes to
// /api/feedback, never to analytics.
export function trackFeedback(context: 'verdict' | 'draft', useful: boolean): void {
  send(`${context}_feedback`, { useful: useful ? 'yes' : 'no' });
}
