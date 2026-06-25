'use client';

import { useState } from 'react';
import DatePicker from 'react-datepicker';
import type { LeaseEntry } from '@/lib/overcharge';

type LeaseRow = {
  startDate: Date | null;
  endDate: Date | null;
  endDateManual: boolean;
  monthlyRent: string;
  leaseTermMonths: 12 | 24;
  vacancyLease?: boolean;
};

type Props = {
  isSubmitting: boolean;
  onSubmit: (input: { history: LeaseEntry[] }) => void;
};

const EMPTY_ROW: LeaseRow = {
  startDate: null,
  endDate: null,
  endDateManual: false,
  monthlyRent: '',
  leaseTermMonths: 12,
  vacancyLease: false,
};

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function isCompleteRow(row: LeaseRow): boolean {
  return (
    row.startDate !== null &&
    row.endDate !== null &&
    row.monthlyRent.trim() !== '' &&
    Number.parseFloat(row.monthlyRent) > 0
  );
}

const inputBase =
  'w-full rounded-[10px] border border-rule bg-bone px-3 py-2.5 text-sm text-ink-text shadow-[0_1px_0_rgba(255,255,255,0.6)_inset] placeholder:text-muted/70 focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/25';

const datePickerClass = `${inputBase} cursor-pointer`;

export default function RentHistoryForm({ isSubmitting, onSubmit }: Props) {
  const [rows, setRows] = useState<LeaseRow[]>([{ ...EMPTY_ROW }]);
  const [error, setError] = useState<string | null>(null);

  function updateRow(i: number, patch: Partial<LeaseRow>) {
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, ...patch };
      // Auto-fill end date when start or term changes, unless user set it manually
      if (!next.endDateManual && next.startDate && ('startDate' in patch || 'leaseTermMonths' in patch)) {
        next.endDate = addMonths(next.startDate, next.leaseTermMonths);
      }
      return next;
    }));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(i: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const completeRows = rows.filter(isCompleteRow);

    if (completeRows.length === 0) {
      setError('Add at least one lease (start, rent, term).');
      return;
    }

    for (const r of completeRows) {
      if (r.startDate! >= r.endDate!) {
        setError(`Lease starting ${toISO(r.startDate!)} must end after it starts.`);
        return;
      }
    }

    const history: LeaseEntry[] = completeRows.map((r) => ({
      startDate: toISO(r.startDate!),
      endDate: toISO(r.endDate!),
      monthlyRent: Number.parseFloat(r.monthlyRent),
      leaseTermMonths: r.leaseTermMonths,
      vacancyLease: r.vacancyLease ?? false,
    }));

    onSubmit({ history });
  }

  const yearRange = (): { min: number; max: number } => {
    const now = new Date().getFullYear();
    return { min: 1970, max: now + 2 };
  };
  const { min: minYear, max: maxYear } = yearRange();

  return (
    <form
      onSubmit={handleSubmit}
      className="paper px-6 sm:px-8 pt-6 pb-7 animate-fade-in-up space-y-6 relative"
    >
      <div>
        <span className="eyebrow">Section III · Lease history</span>
        <h3 className="mt-1.5 font-display text-2xl tracking-tight text-ink-text">
          Compare each renewal against the legal RGB increase.
        </h3>
        <p className="mt-1.5 text-sm text-secondary max-w-xl">
          Enter every lease you’ve signed at this apartment. We’ll walk it forward year-by-year against
          NYC Rent Guidelines Board orders and surface any year where rent rose above the legal cap.
        </p>
      </div>

      <div className="rule" />

      <div className="space-y-3">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-1 eyebrow">
          <span className="col-span-3">Lease start</span>
          <span className="col-span-3">Lease end (auto-filled)</span>
          <span className="col-span-3">Monthly rent</span>
          <span className="col-span-2">Term</span>
          <span className="col-span-1" />
        </div>
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-12 gap-2 items-start rounded-[10px] sm:bg-transparent bg-paper-soft sm:p-0 p-3"
          >
            <div className="col-span-12 sm:col-span-3">
              <DatePicker
                selected={row.startDate}
                onChange={(date: Date | null) => updateRow(i, { startDate: date })}
                dateFormat="MM/dd/yyyy"
                placeholderText="Start date"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                minDate={new Date(minYear, 0, 1)}
                maxDate={new Date(maxYear, 11, 31)}
                className={datePickerClass}
                wrapperClassName="w-full"
                required
              />
            </div>
            <div className="col-span-12 sm:col-span-3">
              <DatePicker
                selected={row.endDate}
                onChange={(date: Date | null) => updateRow(i, { endDate: date, endDateManual: true })}
                dateFormat="MM/dd/yyyy"
                placeholderText="End date (auto-filled)"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                minDate={row.startDate ?? new Date(minYear, 0, 1)}
                maxDate={new Date(maxYear, 11, 31)}
                className={datePickerClass}
                wrapperClassName="w-full"
                required
              />
            </div>
            <div className="relative col-span-7 sm:col-span-3">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted font-mono text-sm">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={row.monthlyRent}
                onChange={(e) => updateRow(i, { monthlyRent: e.target.value })}
                placeholder="2,000.00"
                className={`pl-6 ${inputBase} font-mono`}
                required
              />
            </div>
            <select
              value={row.leaseTermMonths}
              onChange={(e) => updateRow(i, { leaseTermMonths: Number(e.target.value) as 12 | 24 })}
              className={`col-span-3 sm:col-span-2 ${inputBase}`}
            >
              <option value={12}>1-year</option>
              <option value={24}>2-year</option>
            </select>
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
              className="col-span-2 sm:col-span-1 h-[42px] rounded-[10px] border border-rule text-secondary hover:bg-rust-bg hover:text-rust hover:border-rust-bd disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Remove lease"
              title="Remove"
            >
              <svg className="mx-auto h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 5h10M6 5V3.5A.5.5 0 0 1 6.5 3h3a.5.5 0 0 1 .5.5V5M5 5l.7 8.5a.5.5 0 0 0 .5.5h3.6a.5.5 0 0 0 .5-.5L11 5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brass-deep hover:text-brass"
          >
            <span className="text-base leading-none">+</span> Add another lease
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[10px] border border-rust-bd bg-rust-bg px-4 py-3">
          <p className="text-sm text-rust">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-brass w-full px-5 py-3.5 text-sm tracking-wide flex items-center justify-center gap-2 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Calculating…
          </>
        ) : (
          <>
            Estimate overcharge
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7h8m0 0L7 3m4 4L7 11" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}
