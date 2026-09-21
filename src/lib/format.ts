export function toNumber(value: { toNumber?: () => number; toString: () => string } | number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  try {
    const n = value.toNumber?.() ?? Number(value.toString());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function formatUsd(value: number, digits = 2): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  if (abs === 0) return "$0";
  if (abs < 0.01) return `${sign}$${abs.toFixed(4)}`;
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatToken(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (Math.abs(value) > 0 && Math.abs(value) < 0.01) return value.toPrecision(3);
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPct(ratio: number, digits = 2): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatApy(ratio: number, digits = 2): string {
  if (!Number.isFinite(ratio)) return "—";
  if (Math.abs(ratio) > 0 && Math.abs(ratio) < 0.00005) return "0.00%";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function shortAddress(address: string, size = 4): string {
  if (address.length <= size * 2) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export function parseMaturity(symbol: string): Date | null {
  const match = symbol.match(/(\d{1,2})([A-Z]{3})(\d{2})$/i);
  if (!match) return null;
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const month = months[match[2].toUpperCase()];
  if (month == null) return null;
  const year = 2000 + Number(match[3]);
  return new Date(Date.UTC(year, month, Number(match[1])));
}

export function isMatured(symbol: string, now = new Date()): boolean {
  const date = parseMaturity(symbol);
  if (!date) return false;
  return date.getTime() < now.getTime();
}
