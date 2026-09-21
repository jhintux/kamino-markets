import { isMatured, ptFamily } from "./format";
import type { ObligationView, PositionView, ReserveView, RolloverStep } from "./types";

export function findRolloverSource(
  dest: Pick<ReserveView, "mint" | "symbol">,
  deposits: PositionView[]
): PositionView | null {
  const family = ptFamily(dest.symbol);
  if (!family) return null;

  const matches = deposits.filter(
    (deposit) =>
      deposit.mint !== dest.mint &&
      deposit.amount > 0 &&
      ptFamily(deposit.symbol) === family &&
      isMatured(deposit.symbol)
  );
  matches.sort((a, b) => b.amount - a.amount);
  return matches[0] ?? null;
}

export function findRolloverSourceReserve(
  dest: Pick<ReserveView, "mint" | "symbol">,
  reserves: Pick<ReserveView, "mint" | "symbol" | "address" | "decimals">[]
) {
  const family = ptFamily(dest.symbol);
  if (!family) return null;
  const matches = reserves.filter(
    (reserve) =>
      reserve.mint !== dest.mint &&
      ptFamily(reserve.symbol) === family &&
      isMatured(reserve.symbol)
  );
  return matches[0] ?? null;
}

/**
 * Each LTV-capped slice must leave Kamino, convert, and come back as new PT
 * before another withdraw is safe. Tokens already in the wallet always win
 * over pulling more collateral.
 */
export function nextRolloverStep(state: {
  hasDest: boolean;
  hasBase: boolean;
  hasSourcePt: boolean;
  canWithdraw: boolean;
}): RolloverStep | "done" {
  if (state.hasDest) return "supply";
  if (state.hasBase) return "convert";
  if (state.hasSourcePt) return "redeem";
  if (state.canWithdraw) return "withdraw";
  return "done";
}

/**
 * Cap a rollover withdraw at Kamino max LTV (not liquidation LTV).
 * Prefers the on-chain `getMaxWithdrawAmount` when present; otherwise unused
 * borrow power / this reserve's max LTV, with a 0.1% buffer.
 */
export function maxSafeWithdrawAmount(
  obligation: ObligationView,
  source: PositionView
): number {
  if (source.amount <= 0) return 0;
  if (typeof source.maxWithdraw === "number" && Number.isFinite(source.maxWithdraw)) {
    return Math.min(source.amount, Math.max(0, source.maxWithdraw));
  }
  if (obligation.borrowedUsd <= 0) return source.amount;

  const sourceMaxLtv = source.ltv > 0 ? source.ltv : obligation.maxLtv;
  if (sourceMaxLtv <= 0) return source.amount;

  const unusedBorrowUsd = obligation.borrowLimitUsd - (obligation.borrowedAdjustedUsd || obligation.borrowedUsd);
  if (unusedBorrowUsd <= 0 || source.amountUsd <= 0) return 0;

  const maxWithdrawUsd = (unusedBorrowUsd / sourceMaxLtv) * 0.999;
  const unitUsd = source.amountUsd / source.amount;
  return Math.min(source.amount, Math.max(0, maxWithdrawUsd / unitUsd));
}
