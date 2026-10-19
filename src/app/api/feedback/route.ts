// ──────────────────────────────────────────────────────────────────────
// POST /api/feedback — stores an opt-in "can we contact you for your
// story?" email from the FeedbackPrompt component.
//
// Only the email, which prompt it came from (verdict | draft) and a
// timestamp are stored — never the address, BBL or anything else in the
// body, so a contact email can't be tied back to a building. The yes/no
// answer itself goes to Umami from the browser, not here.
//
// Emails land in an Upstash Redis list (`feedback:contacts`). Read them in
// the Upstash console's Data Browser, or with `npm run feedback:contacts`.
// ──────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { getStore, isDurable } from '@/lib/kv';
import { checkRateLimit, clientIpKey } from '@/lib/limits';

export const runtime = 'nodejs';

const CONTACTS_KEY = 'feedback:contacts';
const SUBMISSIONS_PER_HOUR = 10;

const RequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  context: z.enum(['verdict', 'draft']),
});

export async function POST(request: Request): Promise<Response> {
  // Without durable storage an email would vanish on the next cold start —
  // refuse rather than silently dropping it. (Tests opt into memory.)
  if (!isDurable() && process.env.FEEDBACK_ALLOW_MEMORY_STORE !== '1') {
    console.error('Feedback contact received but Upstash is not configured; not stored.');
    return Response.json(
      { error: 'Could not save right now.', code: 'storage_unavailable' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed' }, { status: 422 });
  }

  const store = getStore();
  const limit = await checkRateLimit(store, 'feedback', clientIpKey(request), SUBMISSIONS_PER_HOUR, 3600);
  if (!limit.ok) {
    return Response.json({ error: 'Too many submissions.', code: 'rate_limited' }, { status: 429 });
  }

  try {
    const { email, context } = parsed.data;
    await store.lpush(CONTACTS_KEY, JSON.stringify({ email, context, at: new Date().toISOString() }));
  } catch (err) {
    console.error('Failed to store feedback contact:', err);
    return Response.json({ error: 'Could not save right now.', code: 'storage_unavailable' }, { status: 503 });
  }

  return Response.json({ ok: true });
}
