import {
  address,
  createNoopSigner,
  type Instruction,
} from "@solana/kit";
import {
  KaminoAction,
  PROGRAM_ID,
  VanillaObligation,
} from "@kamino-finance/klend-sdk";
import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js";
import { MARKET_LOOKUP_TABLE, U64_MAX } from "./constants";
import {
  buildConvertToNewPtIxs,
  buildRedeemMaturedPtIxs,
  isDust,
  peekRolloverMints,
} from "./exponent";
import {
  getLedgerInstant,
  getMarketSnapshot,
  getObligationSnapshot,
  getRawTokenBalances,
  getWeb3Connection,
  loadSolsticeMarket,
} from "./kamino";
import { findRolloverSource, findRolloverSourceReserve, maxSafeWithdrawAmount, nextRolloverStep } from "./rollover";
import type { ActionKind, BuiltTransaction, RolloverResponse } from "./types";

function toWeb3Instruction(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((account) => {
      const role = Number(account.role);
      return {
        pubkey: new PublicKey(account.address),
        isSigner: role === 2 || role === 3,
        isWritable: role === 1 || role === 3,
      };
    }),
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

async function getLookupTables(addresses: string[]) {
  const connection = getWeb3Connection();
  const unique = [...new Set(addresses.filter(Boolean))];
  const accounts: AddressLookupTableAccount[] = [];

  for (const value of unique) {
    const result = await connection.getAddressLookupTable(new PublicKey(value));
    if (result.value) accounts.push(result.value);
  }

  return accounts;
}

async function compileWeb3Tx(
  payer: string,
  instructions: TransactionInstruction[],
  lookupTableAddresses: string[],
  label: string
): Promise<BuiltTransaction> {
  if (instructions.length === 0) {
    throw new Error(`No instructions produced for ${label}`);
  }

  const connection = getWeb3Connection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const luts = await getLookupTables([...lookupTableAddresses, MARKET_LOOKUP_TABLE]);
  // v0 + ALTs is required here. Solana v1 txs are 4KB and drop lookup tables, but:
  // - klend-sdk 12 hardcodes createTransactionMessage({ version: 0 }) and LUTs
  // - @solana/kit 2.x / web3.js 1.x cannot build or send v1 (need kit 8 / web3.js 3)
  // - wallet-adapter 0.9 cannot sign v1 (adapter 3.x is still unreleased)
  // https://solana.com/docs/core/transactions/versioned-transactions
  const message = new TransactionMessage({
    payerKey: new PublicKey(payer),
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(luts);

  const tx = new VersionedTransaction(message);
  return {
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    lastValidBlockHeight,
    label,
  };
}

async function compileTx(
  payer: string,
  instructions: Instruction[],
  lookupTableAddresses: string[],
  label: string
): Promise<BuiltTransaction> {
  return compileWeb3Tx(
    payer,
    instructions.map(toWeb3Instruction),
    lookupTableAddresses,
    label
  );
}

async function compileExponentBundle(params: {
  wallet: string;
  setupIxs: TransactionInstruction[];
  ixs: TransactionInstruction[];
  lookupTables: string[];
  label: string;
}): Promise<BuiltTransaction[]> {
  const combinedIxs = [...params.setupIxs, ...params.ixs];
  const combined = await compileWeb3Tx(
    params.wallet,
    combinedIxs,
    params.lookupTables,
    params.label
  );
  if (serializedSize(combined) <= MAX_TX_SIZE || params.setupIxs.length === 0) {
    return [combined];
  }
  return [
    await compileWeb3Tx(params.wallet, params.setupIxs, params.lookupTables, `Setup ${params.label}`),
    await compileWeb3Tx(params.wallet, params.ixs, params.lookupTables, params.label),
  ];
}

function uiAmountToLamports(amount: string, decimals: number, max?: boolean) {
  if (max) return new BN(U64_MAX);
  const lamports = new Decimal(amount || "0").mul(new Decimal(10).pow(decimals));
  if (lamports.lte(0)) throw new Error("Amount must be greater than 0");
  return new BN(lamports.toFixed(0));
}

const MAX_TX_SIZE = 1232;

/** Account-init ixs can land in a prior slot. Refresh/elevation must share the lending tx. */
function isDurableSetupLabel(label: string) {
  return /^(createAtasIxs|CreateLiquidityUserAta|CreateUserAta\[|CreateCollateralUserAta|CreateAdditionalUserTokenAta|createUserLutIx|initUserMetadata|InitReferrerTokenState|InitObligation)/i.test(
    label
  );
}

function partitionSetupIxs(action: KaminoAction) {
  const durable: Instruction[] = [];
  const sameSlot: Instruction[] = [];

  for (let i = 0; i < action.setupIxs.length; i++) {
    const label = action.setupIxsLabels[i] ?? "";
    if (isDurableSetupLabel(label)) durable.push(action.setupIxs[i]);
    else sameSlot.push(action.setupIxs[i]);
  }

  return { durable, sameSlot };
}

function serializedSize(built: BuiltTransaction) {
  return Buffer.from(built.transaction, "base64").length;
}

export async function buildMarketAction(params: {
  wallet: string;
  reserveAddress: string;
  amount: string;
  action: ActionKind;
  max?: boolean;
}): Promise<BuiltTransaction[]> {
  const market = await loadSolsticeMarket(true);
  const reserve = market.getReserveByAddress(address(params.reserveAddress));
  if (!reserve) {
    throw new Error("Reserve not found in Solstice Market");
  }

  const instant = await getLedgerInstant();
  const owner = createNoopSigner(address(params.wallet));
  const obligation = new VanillaObligation(PROGRAM_ID);
  const amount = uiAmountToLamports(params.amount, reserve.getMintDecimals(), params.max);

  const shared = {
    kaminoMarket: market,
    amount,
    reserveAddress: reserve.address,
    owner,
    obligation,
    useV2Ixs: true,
    scopeRefreshConfig: undefined,
    extraComputeBudget: 1_000_000,
    includeAtaIxs: true,
    requestElevationGroup: true,
    initUserMetadata: { skipInitialization: false, skipLutCreation: true },
    currentLedgerInstant: instant,
  };

  let action;
  if (params.action === "supply") {
    action = await KaminoAction.buildDepositTxns(shared);
  } else if (params.action === "withdraw") {
    action = await KaminoAction.buildWithdrawTxns(shared);
  } else if (params.action === "borrow") {
    action = await KaminoAction.buildBorrowTxns(shared);
  } else if (params.action === "repay") {
    action = await KaminoAction.buildRepayTxns(shared);
  } else {
    throw new Error("Unsupported action");
  }

  const lutAddresses = (action.luts ?? []).map((lut) => String(lut));
  const allIxs = KaminoAction.actionToIxs(action);
  const combined = await compileTx(params.wallet, allIxs, lutAddresses, params.action);

  if (serializedSize(combined) <= MAX_TX_SIZE) {
    return [combined];
  }

  const { durable, sameSlot } = partitionSetupIxs(action);
  const transactions: BuiltTransaction[] = [];

  if (durable.length) {
    transactions.push(
      await compileTx(
        params.wallet,
        [...(action.computeBudgetIxs ?? []), ...durable],
        lutAddresses,
        "Setup accounts"
      )
    );
  }

  transactions.push(
    await compileTx(
      params.wallet,
      [
        ...(action.computeBudgetIxs ?? []),
        ...sameSlot,
        ...KaminoAction.actionToLendingIxs(action),
        ...(action.postLendingIxs ?? []),
        ...(action.cleanupIxs ?? []),
      ],
      lutAddresses,
      params.action
    )
  );

  return transactions;
}

function uiFromRaw(amount: bigint, decimals: number) {
  if (decimals <= 0) return amount.toString();
  const factor = 10n ** BigInt(decimals);
  const whole = amount / factor;
  const frac = amount % factor;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, "0")}`.replace(/0+$/, "");
}

export async function buildRollover(params: {
  wallet: string;
  reserveAddress: string;
  amount?: string;
}): Promise<RolloverResponse> {
  const [snapshot, marketView] = await Promise.all([
    getObligationSnapshot(params.wallet, true),
    getMarketSnapshot(true),
  ]);
  if (!snapshot) {
    throw new Error("No Solstice obligation found for this wallet");
  }

  const destReserveView = marketView.reserves.find((row) => row.address === params.reserveAddress);
  if (!destReserveView) {
    throw new Error("Destination reserve not found in Solstice Market");
  }

  const sourcePosition = findRolloverSource(destReserveView, snapshot.deposits);
  const sourceReserve =
    marketView.reserves.find((row) => row.address === sourcePosition?.reserveAddress) ||
    findRolloverSourceReserve(destReserveView, marketView.reserves);
  if (!sourceReserve) {
    throw new Error(`No matured ${destReserveView.symbol.replace(/-\d.+$/, "")} reserve found to roll from`);
  }

  const { baseMint } = await peekRolloverMints(sourceReserve.mint, destReserveView.mint);
  const owner = new PublicKey(params.wallet);
  const balances = await getRawTokenBalances(params.wallet, [
    sourceReserve.mint,
    destReserveView.mint,
    baseMint,
  ]);

  const sourceWallet = balances[sourceReserve.mint]?.amount ?? 0n;
  const destWallet = balances[destReserveView.mint]?.amount ?? 0n;
  const baseWallet = balances[baseMint]?.amount ?? 0n;

  const requestedWithdraw = params.amount
    ? Number(params.amount)
    : sourcePosition
      ? maxSafeWithdrawAmount(snapshot, sourcePosition)
      : 0;
  const safeWithdraw = sourcePosition
    ? Math.min(sourcePosition.amount, maxSafeWithdrawAmount(snapshot, sourcePosition), requestedWithdraw)
    : 0;

  const meta = {
    sourceSymbol: sourceReserve.symbol,
    destSymbol: destReserveView.symbol,
  };

  const step = nextRolloverStep({
    hasDest: !isDust(destWallet),
    hasBase: !isDust(baseWallet),
    hasSourcePt: !isDust(sourceWallet),
    canWithdraw: Boolean(sourcePosition && sourcePosition.amount > 0 && safeWithdraw > 0),
  });

  if (step === "supply") {
    const destDecimals = destReserveView.decimals || 6;
    const transactions = await buildMarketAction({
      wallet: params.wallet,
      reserveAddress: params.reserveAddress,
      amount: uiFromRaw(destWallet, destDecimals),
      action: "supply",
    });
    return {
      transactions,
      step,
      done: false,
      ...meta,
      message: `Supply ${destReserveView.symbol} to Kamino`,
    };
  }

  if (step === "convert") {
    const built = await buildConvertToNewPtIxs({
      owner,
      ptMint: destReserveView.mint,
      amountBase: baseWallet,
    });
    return {
      transactions: await compileExponentBundle({
        wallet: params.wallet,
        ...built,
      }),
      step,
      done: false,
      ...meta,
      message: `Convert to ${destReserveView.symbol} on Exponent`,
    };
  }

  if (step === "redeem") {
    const built = await buildRedeemMaturedPtIxs({
      owner,
      ptMint: sourceReserve.mint,
      amountPt: sourceWallet,
    });
    return {
      transactions: await compileExponentBundle({
        wallet: params.wallet,
        ...built,
      }),
      step,
      done: false,
      ...meta,
      message: `Redeem matured ${sourceReserve.symbol} on Exponent`,
    };
  }

  if (step === "withdraw" && sourcePosition) {
    const useMax = safeWithdraw >= sourcePosition.amount * 0.999;
    const transactions = await buildMarketAction({
      wallet: params.wallet,
      reserveAddress: sourcePosition.reserveAddress,
      amount: String(safeWithdraw),
      action: "withdraw",
      max: useMax,
    });
    return {
      transactions,
      step,
      done: false,
      ...meta,
      message: `Withdraw ${sourceReserve.symbol} from Kamino`,
    };
  }

  if (sourcePosition && sourcePosition.amount > 0) {
    throw new Error(
      `Withdrawing ${sourceReserve.symbol} would exceed max LTV. Repay some ${snapshot.borrows[0]?.symbol ?? "debt"} first, or roll a smaller slice after supplying new PT.`
    );
  }

  return {
    transactions: [],
    step: "done",
    done: true,
    ...meta,
    message: `Rolled into ${destReserveView.symbol}`,
  };
}
