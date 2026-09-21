import {
  address,
  createNoopSigner,
  type Instruction,
} from "@solana/kit";
import {
  getCurrentLedgerInstant,
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
import { getKitRpc, getWeb3Connection, loadSolsticeMarket } from "./kamino";
import type { ActionKind, BuiltTransaction } from "./types";

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

async function compileTx(
  payer: string,
  instructions: Instruction[],
  lookupTableAddresses: string[],
  label: string
): Promise<BuiltTransaction> {
  if (instructions.length === 0) {
    throw new Error(`No instructions produced for ${label}`);
  }

  const connection = getWeb3Connection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
  const luts = await getLookupTables([...lookupTableAddresses, MARKET_LOOKUP_TABLE]);
  const message = new TransactionMessage({
    payerKey: new PublicKey(payer),
    recentBlockhash: blockhash,
    instructions: instructions.map(toWeb3Instruction),
  }).compileToV0Message(luts);

  const tx = new VersionedTransaction(message);
  return {
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    lastValidBlockHeight,
    label,
  };
}

function uiAmountToLamports(amount: string, decimals: number, max?: boolean) {
  if (max) return new BN(U64_MAX);
  const lamports = new Decimal(amount || "0").mul(new Decimal(10).pow(decimals));
  if (lamports.lte(0)) throw new Error("Amount must be greater than 0");
  return new BN(lamports.toFixed(0));
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

  const instant = await getCurrentLedgerInstant(getKitRpc());
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
  const transactions: BuiltTransaction[] = [];

  if (action.setupIxs?.length) {
    transactions.push(
      await compileTx(params.wallet, action.setupIxs, lutAddresses, "Setup accounts")
    );
  }

  const mainIxs = [
    ...(action.computeBudgetIxs ?? []),
    ...(action.inBetweenIxs ?? []),
    ...(action.lendingIxs ?? []),
    ...(action.postLendingIxs ?? []),
    ...(action.cleanupIxs ?? []),
  ];

  transactions.push(await compileTx(params.wallet, mainIxs, lutAddresses, params.action));
  return transactions;
}
