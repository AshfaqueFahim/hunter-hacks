import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { estimate } from '@/lib/overcharge';
import { getDb } from '@/lib/db';
import { lookups } from '@/lib/schema';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected ISO date YYYY-MM-DD');
const LeaseTerm = z.union([z.literal(12), z.literal(24)]);

const LeaseEntrySchema = z.object({
  startDate: IsoDate,
  endDate: IsoDate,
  monthlyRent: z.number().positive(),
  leaseTermMonths: LeaseTerm,
  vacancyLease: z.boolean().optional(),
});

const RequestSchema = z.object({
  history: z.array(LeaseEntrySchema).max(40),
  bbl: z.string().min(1).optional(),
  lookupId: z.number().int().positive().optional(),
  asOfDate: IsoDate.optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { history, lookupId, asOfDate } = parsed.data;

  const result = estimate({ history, asOfDate });

  if (lookupId !== undefined) {
    try {
      const cents = Math.round(result.overcharge_total_within_limit * 100);
      const db = getDb();
      db.update(lookups)
        .set({ estimatedOverchargeCents: cents })
        .where(eq(lookups.id, lookupId))
        .run();
    } catch (err) {
      console.error('Failed to update lookup with overcharge:', err);
    }
  }

  return Response.json(result);
}
