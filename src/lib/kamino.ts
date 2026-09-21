import { address, createSolanaRpc } from "@solana/kit";
import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  getCurrentLedgerInstant,
  KaminoMarket,
  PROGRAM_ID,
  ReserveStatus,
  VanillaObligation,
  type LedgerInstant,
} from "@kamino-finance/klend-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  DEFAULT_RPC,
  NEW_ASSETS,
  SLOT_DURATION_MS,
  SOLSTICE_MARKET,
  TOKEN_LOGOS,
} from "./constants";
import { toNumber } from "./format";
import type { MarketSnapshot, ObligationView, PositionView, ReserveView } from "./types";

export function getRpcUrl() {
  return DEFAULT_RPC;
}

export function getKitRpc() {
  return createSolanaRpc(getRpcUrl());
}

export function getWeb3Connection() {
  return new Connection(getRpcUrl(), "confirmed");
}

function isMissingBlockError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Block not available") ||
    message.includes("Block time not found") ||
    message.includes("#-32004")
  );
}

/** Helius often returns -32004 when getSlot races a skipped/unindexed slot. */
export async function getLedgerInstant() {
  const rpc = getKitRpc();
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await getCurrentLedgerInstant(rpc, "confirmed");
    } catch (error) {
      lastError = error;
      if (!isMissingBlockError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }
  throw lastError;
}

let marketPromise: Promise<KaminoMarket> | null = null;
let marketLoadedAt = 0;
const MARKET_TTL_MS = 20_000;

export async function loadSolsticeMarket(force = false): Promise<KaminoMarket> {
  const now = Date.now();
  if (!force && marketPromise && now - marketLoadedAt < MARKET_TTL_MS) {
    return marketPromise;
  }

  marketLoadedAt = now;
  marketPromise = (async () => {
    const rpc = getKitRpc();
    const market = await KaminoMarket.load(
      rpc,
      address(SOLSTICE_MARKET),
      SLOT_DURATION_MS || DEFAULT_RECENT_SLOT_DURATION_MS,
      PROGRAM_ID,
      true
    );
    if (!market) {
      throw new Error("Unable to load Solstice Market from chain");
    }
    return market;
  })();

  try {
    return await marketPromise;
  } catch (error) {
    marketPromise = null;
    throw error;
  }
}

function resolveSymbol(mint: string, fallback: string) {
  return NEW_ASSETS[mint]?.symbol || fallback || shortMint(mint);
}

function shortMint(mint: string) {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function serializeReserve(reserve: Awaited<ReturnType<KaminoMarket["getReserves"]>>[number], instant: LedgerInstant): ReserveView {
  const mint = String(reserve.getLiquidityMint());
  const known = NEW_ASSETS[mint];
  const symbol = resolveSymbol(mint, reserve.symbol || reserve.getTokenSymbol() || "");
  const decimals = reserve.getMintDecimals();
  const factor = 10 ** decimals;
  const status = String(reserve.stats.status);
  const isHidden = status === ReserveStatus.Hidden || status === "Hidden";
  const isObsolete = status === ReserveStatus.Obsolete || status === "Obsolete";
  const priceUsd = toNumber(reserve.tokenOraclePrice?.price);
  const totalSupply = toNumber(reserve.getTotalSupply()) / factor;
  const totalBorrow = toNumber(reserve.getBorrowedAmount()) / factor;
  const ltv = toNumber(reserve.stats.loanToValue);
  const liquidationLtv = toNumber(reserve.stats.liquidationThreshold);
  const borrowLimit = toNumber(reserve.stats.reserveBorrowLimit) / factor;
  const depositLimit = toNumber(reserve.stats.reserveDepositLimit) / factor;
  const supplyApy = toNumber(reserve.totalSupplyAPY(instant));
  const borrowApy = toNumber(reserve.totalBorrowAPY(instant));

  return {
    address: String(reserve.address),
    mint,
    symbol,
    name: known?.name || symbol,
    decimals,
    status,
    isNew: Boolean(known) || isHidden,
    isHidden,
    isObsolete,
    isUiDeprecated: Boolean(reserve.stats.isUIDeprecated),
    priceUsd,
    totalSupply,
    totalBorrow,
    totalSupplyUsd: toNumber(reserve.getDepositTvl()),
    totalBorrowUsd: toNumber(reserve.getBorrowTvl()),
    supplyApy,
    borrowApy,
    utilization: toNumber(reserve.calculateUtilizationRatio()),
    ltv,
    liquidationLtv,
    depositLimit,
    borrowLimit,
    canSupply: !isObsolete && depositLimit > 0,
    canBorrow: !isObsolete && borrowLimit > 0,
    logoUrl: TOKEN_LOGOS[mint],
  };
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const market = await loadSolsticeMarket();
  const instant = await getLedgerInstant();
  const reserves = market.getReserves().map((reserve) => serializeReserve(reserve, instant));

  reserves.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    return b.totalSupplyUsd - a.totalSupplyUsd;
  });

  return {
    name: "Solstice Market",
    address: SOLSTICE_MARKET,
    loadedAt: new Date().toISOString(),
    slot: instant.slot.toString(),
    totalDepositTvl: toNumber(market.getTotalDepositTVL()),
    totalBorrowTvl: toNumber(market.getTotalBorrowTVL()),
    reserves,
  };
}

function mapPosition(
  reserveMap: Map<string, ReserveView>,
  reserveAddress: string,
  amountLamports: number,
  marketValue: number,
  side: "supply" | "borrow"
): PositionView | null {
  const reserve = reserveMap.get(reserveAddress);
  if (!reserve) return null;
  const amount = amountLamports / 10 ** reserve.decimals;
  return {
    reserveAddress,
    mint: reserve.mint,
    symbol: reserve.symbol,
    amount,
    amountUsd: marketValue,
    apy: side === "supply" ? reserve.supplyApy : reserve.borrowApy,
    isNew: reserve.isNew,
  };
}

export async function getObligationSnapshot(wallet: string): Promise<ObligationView | null> {
  const market = await loadSolsticeMarket();
  const instant = await getLedgerInstant();
  const obligation = await market.getObligationByWallet(
    address(wallet),
    new VanillaObligation(PROGRAM_ID)
  );

  if (!obligation) return null;

  const reserves = market.getReserves().map((reserve) => serializeReserve(reserve, instant));
  const reserveMap = new Map(reserves.map((reserve) => [reserve.address, reserve]));

  const deposits: PositionView[] = [];
  for (const deposit of obligation.deposits.values()) {
    const mapped = mapPosition(
      reserveMap,
      String(deposit.reserveAddress),
      toNumber(deposit.amount),
      toNumber(deposit.marketValueRefreshed),
      "supply"
    );
    if (mapped && mapped.amount > 0) deposits.push(mapped);
  }

  const borrows: PositionView[] = [];
  for (const borrow of obligation.borrows.values()) {
    const mapped = mapPosition(
      reserveMap,
      String(borrow.reserveAddress),
      toNumber(borrow.amount),
      toNumber(borrow.marketValueRefreshed),
      "borrow"
    );
    if (mapped && mapped.amount > 0) borrows.push(mapped);
  }

  const suppliedUsd = toNumber(obligation.refreshedStats.userTotalDeposit);
  const borrowedUsd = toNumber(obligation.refreshedStats.userTotalBorrow);
  const netValueUsd = toNumber(obligation.getNetAccountValue());

  const supplyYield = deposits.reduce((sum, pos) => sum + pos.amountUsd * pos.apy, 0);
  const borrowCost = borrows.reduce((sum, pos) => sum + pos.amountUsd * pos.apy, 0);
  const netApy = netValueUsd !== 0 ? (supplyYield - borrowCost) / Math.abs(netValueUsd) : 0;

  return {
    address: String(obligation.obligationAddress),
    tag: obligation.obligationTag,
    netValueUsd,
    suppliedUsd,
    borrowedUsd,
    ltv: toNumber(obligation.refreshedStats.loanToValue),
    liquidationLtv: toNumber(obligation.refreshedStats.liquidationLtv),
    borrowUtilization: toNumber(obligation.refreshedStats.borrowUtilization),
    netApy,
    deposits,
    borrows,
  };
}

export async function getWalletBalances(wallet: string, mints: string[]) {
  const connection = getWeb3Connection();
  const owner = new PublicKey(wallet);
  const unique = [...new Set(mints.filter(Boolean))];
  const result: Record<string, { amount: number; mint: string }> = {};

  const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  });

  const token2022 = await connection.getParsedTokenAccountsByOwner(owner, {
    programId: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
  });

  for (const { account } of [...accounts.value, ...token2022.value]) {
    const info = account.data.parsed?.info;
    const mint = info?.mint as string | undefined;
    if (!mint || (unique.length > 0 && !unique.includes(mint))) continue;
    const tokenAmount = info?.tokenAmount;
    const uiAmount = Number(tokenAmount?.uiAmount ?? 0);
    result[mint] = { amount: uiAmount, mint };
  }

  for (const mint of unique) {
    if (!result[mint]) result[mint] = { amount: 0, mint };
  }

  return result;
}
