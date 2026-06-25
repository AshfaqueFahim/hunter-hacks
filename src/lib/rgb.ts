import rgbOrdersData from '../../data/seed/rgb_orders.json';

export type RgbOrder = {
  order_no: number;
  lease_start_from: string;
  lease_start_to: string;
  one_year_pct: number;
  two_year_pct: number;
  notes: string | null;
};

export type LeaseTerm = 12 | 24;

export type RgbIncrease = {
  orderNo: number;
  pct: number;
  leaseStartFrom: string;
  leaseStartTo: string;
  notes: string | null;
};

const ORDERS: RgbOrder[] = (rgbOrdersData as RgbOrder[])
  .slice()
  .sort((a, b) => a.lease_start_from.localeCompare(b.lease_start_from));

function toIsoDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getOrder(leaseStart: Date | string): RgbOrder | null {
  const iso = toIsoDate(leaseStart);
  return ORDERS.find((o) => iso >= o.lease_start_from && iso <= o.lease_start_to) ?? null;
}

export function getIncrease(leaseStart: Date | string, termMonths: LeaseTerm): RgbIncrease | null {
  const order = getOrder(leaseStart);
  if (!order) return null;
  const pct = termMonths === 12 ? order.one_year_pct : order.two_year_pct;
  return {
    orderNo: order.order_no,
    pct,
    leaseStartFrom: order.lease_start_from,
    leaseStartTo: order.lease_start_to,
    notes: order.notes,
  };
}

export function listOrders(): RgbOrder[] {
  return ORDERS.slice();
}
