// ──────────────────────────────────────────────────────────────────────
// Fills the REAL, official DHCR RA-89 PDF (an AcroForm — a PDF with
// named, programmatically-fillable fields) using pdf-lib. Only called
// client-side, from ComplaintPreview.tsx's handleRa89Download(), and only
// after an AI draft already exists (its §14 narrative is reused here).
//
// The field NAMES below ('Tenant's Last Name First Name Middle Initial',
// 'Check Box5', etc.) are NOT made up — they're whatever names the
// official PDF's form fields happen to have, extracted by running
// scripts/inspect-ra89-fields.ts against public/ra-89-template.pdf. If
// DHCR ever reissues the form with different field names, that script is
// the way to re-discover them; this file would need updating to match.
// ──────────────────────────────────────────────────────────────────────

import { PDFDocument } from 'pdf-lib';
import type { Estimate } from './overcharge';

export type Ra89Input = {
  // §1-4 tenant contact
  tenantName?: string;
  unit?: string;
  mailingAddress?: string;
  mailingCity?: string;
  mailingState?: string;
  mailingZip?: string;
  address: string; // subject building

  // §5 phones
  phoneHome?: string;
  phoneDay?: string;

  // §6-7 tenant classification
  tenantType?: 'prime' | 'sub' | 'hotel' | 'roommate';
  scrieDrie?: boolean;
  section8?: 'none' | 'hud' | 'nycha' | 'hcv' | 'hpd';
  coop?: boolean;

  // §8 move-in
  moveInDate?: string;       // ISO YYYY-MM-DD
  initialRent?: number;

  // §10 electricity
  electricityIncluded?: boolean | null;

  // §11 owner/agent
  ownerName?: string;
  ownerAddress?: string;
  ownerPhone?: string;

  // §13 causes
  causes?: string[];

  // §14 narrative (extracted from AI draft block B)
  narrative: string;

  // §15 security deposit
  securityDepositAmount?: number;
  securityDepositPaidOn?: string;

  // §16 court
  raisedInCourt?: boolean;
  courtIndexNo?: string;

  // estimate for §9 + §17 rent history
  estimate: Estimate;
};

// Swallows "field doesn't exist" / "wrong field type" errors on purpose
// — if DHCR's PDF is missing a field we expect, we'd rather silently
// skip that one value than blow up the whole fill for every other field.
function set(form: Awaited<ReturnType<typeof PDFDocument.prototype.getForm>>, name: string, value: string) {
  try { form.getTextField(name).setText(value); } catch { /* field absent or wrong type */ }
}

function check(form: Awaited<ReturnType<typeof PDFDocument.prototype.getForm>>, name: string, checked: boolean) {
  try {
    const cb = form.getCheckBox(name);
    if (checked) cb.check(); else cb.uncheck();
  } catch { /* skip */ }
}

// RA-89's date fields are three separate boxes (Month / Day / Year), not
// one text field — this breaks an ISO "YYYY-MM-DD" string into the three
// pieces each `s(...)` call below needs.
function splitIso(iso: string | undefined): { m: string; d: string; y: string } {
  if (!iso) return { m: '', d: '', y: '' };
  const [y, m, d] = iso.split('-');
  return { m: m ?? '', d: d ?? '', y: y ?? '' };
}

// "$1,234.56" formatting for every dollar amount written into the form.
function usd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// THE function handleRa89Download() calls. Loads the static template PDF
// shipped in /public, fills it field-by-field from `input` (which is
// built by ComplaintPreview.tsx from the same `form` state used for the
// AI draft, plus the extracted §14 narrative), and returns the filled
// PDF's raw bytes — saving/downloading is the caller's job
// (see downloadRa89 at the bottom of this file).
export async function fillRa89Form(input: Ra89Input): Promise<Uint8Array> {
  const res = await fetch('/ra-89-template.pdf');
  if (!res.ok) throw new Error('Could not load RA-89 template PDF');
  const buf = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buf);
  const form = pdfDoc.getForm();

  // Short aliases used for every field write below — `s` for a text
  // field, `c` for a checkbox. Keeps the section-by-section mapping that
  // follows readable as a flat list of "field name → value" pairs.
  const s = (name: string, value: string) => set(form, name, value);
  const c = (name: string, on: boolean) => check(form, name, on);

  // ── §1 Tenant name ──────────────────────────────────────────────────
  s("Tenant's Last Name First Name Middle Initial", input.tenantName ?? '');

  // ── §2-3 Mailing address ────────────────────────────────────────────
  const aptSuffix = input.unit ? `, Apt ${input.unit}` : '';
  s('Current Address Apt No', (input.mailingAddress ?? input.address) + aptSuffix);
  const cityStateZip = [input.mailingCity, input.mailingState, input.mailingZip]
    .filter(Boolean).join(', ');
  s('City State Zip Code', cityStateZip);

  // ── §4 Subject building ─────────────────────────────────────────────
  s('Subject Builing Address and Apartment Number', input.address + aptSuffix);

  // ── §5 Phones ───────────────────────────────────────────────────────
  s('5  Telephone Number Home', input.phoneHome ?? '');
  s('Day time', input.phoneDay ?? '');

  // ── §6 Tenant type ──────────────────────────────────────────────────
  // Check Box5=prime, 6=sub-tenant, 7=hotel/SRO, 8=roommate
  c('Check Box5', input.tenantType === 'prime' || !input.tenantType);
  c('Check Box6', input.tenantType === 'sub');
  c('Check Box7', input.tenantType === 'hotel');
  c('Check Box8', input.tenantType === 'roommate');

  // ── §6a SCRIE / DRIE ────────────────────────────────────────────────
  // Check Box9=yes, Check Box10=no
  c('Check Box9', !!input.scrieDrie);
  c('Check Box10', !input.scrieDrie);

  // ── §6b Section 8 ───────────────────────────────────────────────────
  // Check Box11=none, 12=HUD, 13=NYCHA, 14=HCV, 15=HPD
  const s8 = input.section8 ?? 'none';
  c('Check Box11', s8 === 'none');
  c('Check Box12', s8 === 'hud');
  c('Check Box13', s8 === 'nycha');
  c('Check Box14', s8 === 'hcv');
  c('Check Box15', s8 === 'hpd');

  // ── §7 Co-op ────────────────────────────────────────────────────────
  // Check Box16=yes, Check Box17=no
  c('Check Box16', !!input.coop);
  c('Check Box17', !input.coop);

  // ── §8 Move-in ──────────────────────────────────────────────────────
  // The true first lease is `estimate.baseline_lease`, NOT
  // `years_analyzed[0]` — overcharge.ts's estimate() reserves the
  // tenant's very first lease as the legal-rent baseline and starts
  // years_analyzed at the SECOND lease, so years_analyzed[0] is one
  // lease too late for "when did you move in / what did you pay."
  const baseline = input.estimate.baseline_lease;
  const moveIn = input.moveInDate ?? baseline?.lease_start;
  const mi = splitIso(moveIn);
  s('Month', mi.m);
  s('Day', mi.d);
  s('Year', mi.y);
  const initialRent = input.initialRent ?? baseline?.monthly_rent;
  if (initialRent) s('rent', usd(initialRent));

  // ── §9 Current rent ─────────────────────────────────────────────────
  s('My current rent is', usd(input.estimate.actual_rent_monthly));

  // ── §10 Electricity ─────────────────────────────────────────────────
  // Check Box18=yes, Check Box19=no
  c('Check Box18', input.electricityIncluded === true);
  c('Check Box19', input.electricityIncluded === false);

  // ── §11 Owner / managing agent ──────────────────────────────────────
  s('Name', input.ownerName ?? '');
  // HPD address format: "123 MAIN ST · NEW YORK, NY 10001" — split on ·
  const ownerAddrParts = (input.ownerAddress ?? '').split('·').map((p) => p.trim());
  s('Number/Street', ownerAddrParts[0] ?? '');
  s('City State Zip Code_3', ownerAddrParts[1] ?? '');
  s('Telephone Number', input.ownerPhone ?? '');

  // ── §13 Overcharge period ───────────────────────────────────────────
  const overcharged = input.estimate.years_analyzed.filter((y) => y.overcharge_monthly > 0);
  if (overcharged.length > 0) {
    const from = splitIso(overcharged[0].lease_start);
    const to = splitIso(overcharged[overcharged.length - 1].lease_end);
    s('Month_4', from.m); s('Day_4', from.d); s('Year_4', from.y);
    s('Month_5', to.m);   s('Day_5', to.d);   s('Year_5', to.y);
  }

  // ── §13 Causes ──────────────────────────────────────────────────────
  // Check Box25=other/overcharge, 26=MCI, 27=IAI, 28=rent reduction order,
  // 29=missing registrations, 30=parking/fees, 31=FMRA/security deposit
  const causes = input.causes ?? ['other'];
  c('Check Box25', causes.includes('other'));
  c('Check Box26', causes.includes('mci'));
  c('Check Box27', causes.includes('iai'));
  c('Check Box28', causes.includes('rent_reduction_order'));
  c('Check Box29', causes.includes('missing_registrations'));
  c('Check Box30', causes.includes('parking') || causes.includes('illegal_fees'));
  c('Check Box31', causes.includes('fmra') || causes.includes('security_deposit'));

  // ── §14 Narrative ───────────────────────────────────────────────────
  s('Text32', input.narrative);

  // ── §15 Security deposit ────────────────────────────────────────────
  if (input.securityDepositAmount) {
    s('Security Deposit', usd(input.securityDepositAmount));
    const dp = splitIso(input.securityDepositPaidOn);
    s('Month_6', dp.m); s('Day_6', dp.d); s('Year_6', dp.y);
  }

  // ── §16 Raised in court ─────────────────────────────────────────────
  c('Check Box35', !!input.raisedInCourt);
  c('Check Box36', !input.raisedInCourt);
  if (input.raisedInCourt && input.courtIndexNo) s('Index No', input.courtIndexNo);

  // ── §17 Rent history (up to 7 lease rows) ───────────────────────────
  const leases = input.estimate.years_analyzed.slice(0, 7);
  leases.forEach((lease, i) => {
    const n = i + 1;
    const fs = splitIso(lease.lease_start);
    const fe = splitIso(lease.lease_end);
    s(`Lease Periods From  To${n}`, `${fs.m}/${fs.d}/${fs.y} – ${fe.m}/${fe.d}/${fe.y}`);
    s(`Lease Amount ${n}`, usd(lease.actual_monthly));
  });

  // Yearly rent summary columns (Current Year = most recent lease)
  const yearLabels = ['Current Year', 'Last Year', '2 Years Prior', '3 Years Prior', '4 Years Prior', '5 Years Prior', '6 Years Prior'];
  const sorted = [...input.estimate.years_analyzed].sort((a, b) => b.lease_start.localeCompare(a.lease_start));
  sorted.slice(0, 7).forEach((lease, i) => {
    s(yearLabels[i], usd(lease.actual_monthly));
  });

  // ── §19 Evidence checkboxes ─────────────────────────────────────────
  // Check Box39=leases, 40=rent receipts, 41=cancelled checks,
  // Check Box42=money orders, 43=other
  c('Check Box39', true); // always attach leases
  c('Check Box40', true); // always attach rent receipts

  // ── Signature date (page 4) — leave signature line blank ────────────
  s('Date', new Date().toLocaleDateString('en-US'));

  // `updateFieldAppearances: false` skips pdf-lib's (slow, occasionally
  // glitchy) re-rendering of each field's visual appearance — the PDF
  // viewer regenerates them from the field value anyway when it opens
  // the file, so this is purely a save-time perf/robustness trade.
  return pdfDoc.save({ updateFieldAppearances: false });
}

// Browser-only "save this Uint8Array as a file" — wraps it in a Blob,
// makes a temporary object URL, and fakes a click on an <a download>.
export function downloadRa89(bytes: Uint8Array, bbl: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RA-89-filled-${bbl}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
