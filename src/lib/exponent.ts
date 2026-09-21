import {
  LOCAL_ENV,
  MarketThree,
  Vault,
  YtPosition,
} from "@exponent-labs/exponent-sdk";
import {
  EXPONENTCLMM_PROGRAM_ID,
} from "@exponent-labs/exponent-sdk/client/clmm";
import {
  EXPONENTCORE_PROGRAM_ID,
} from "@exponent-labs/exponent-sdk/client/core";
import {
  ComputeBudgetProgram,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import { getWeb3Connection } from "./kamino";

type RpcConnection = Parameters<typeof Vault.load>[1];

function rpc() {
  return getWeb3Connection() as unknown as RpcConnection;
}

const DUST = 1000n;
const vaultByPt = new Map<string, string>();
const clmmByPt = new Map<string, string>();

export function isDust(amount: bigint) {
  return amount <= DUST;
}

async function findAccountByPtMint(
  kind: "vault" | "clmm",
  ptMint: string
) {
  const cache = kind === "vault" ? vaultByPt : clmmByPt;
  const cached = cache.get(ptMint);
  if (cached) return new PublicKey(cached);

  const connection = getWeb3Connection();
  const programId = kind === "vault" ? EXPONENTCORE_PROGRAM_ID : EXPONENTCLMM_PROGRAM_ID;
  const mintOffset = kind === "vault" ? 104 : 72;
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: mintOffset, bytes: ptMint } }],
  });
  const address = accounts[0]?.pubkey;
  if (!address) return null;
  cache.set(ptMint, address.toBase58());
  return address;
}

export async function findVaultAddressByPtMint(ptMint: string) {
  const address = await findAccountByPtMint("vault", ptMint);
  if (!address) {
    throw new Error(`No Exponent vault found for PT mint ${ptMint}`);
  }
  return address;
}

export async function findClmmAddressByPtMint(ptMint: string) {
  try {
    return await findAccountByPtMint("clmm", ptMint);
  } catch {
    return null;
  }
}

export async function loadVaultByPtMint(ptMint: string) {
  const connection = rpc();
  const address = await findVaultAddressByPtMint(ptMint);
  return Vault.load(LOCAL_ENV, connection, address);
}

export async function loadClmmByPtMint(ptMint: string) {
  const address = await findClmmAddressByPtMint(ptMint);
  if (!address) return null;
  const connection = rpc();
  return MarketThree.load(LOCAL_ENV, connection, address);
}

function withComputeBudget(ixs: TransactionInstruction[]) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    ...ixs,
  ];
}

export async function buildRedeemMaturedPtIxs(params: {
  owner: PublicKey;
  ptMint: string;
  amountPt: bigint;
}) {
  const vault = await loadVaultByPtMint(params.ptMint);
  const { ixs, setupIxs } = await vault.ixMergeToBase({
    owner: params.owner,
    amountPy: params.amountPt,
  });
  return {
    setupIxs: withComputeBudget(setupIxs),
    ixs: withComputeBudget(ixs),
    lookupTables: [vault.addressLookupTable.toBase58()],
    baseMint: vault.flavor.mintBase.toBase58(),
    label: "Redeem matured PT",
  };
}

async function yieldPositionExists(owner: PublicKey, vault: Vault) {
  try {
    await YtPosition.loadByOwner(LOCAL_ENV, vault.connection, owner, vault);
    return true;
  } catch {
    return false;
  }
}

export async function buildConvertToNewPtIxs(params: {
  owner: PublicKey;
  ptMint: string;
  amountBase: bigint;
}) {
  const owner = params.owner;
  const market = await loadClmmByPtMint(params.ptMint);
  if (market) {
    const minPtOut = (params.amountBase * 90n) / 100n;
    const { ixs, setupIxs } = await market.ixWrapperBuyPt({
      owner,
      baseIn: params.amountBase,
      minPtOut: minPtOut > 0n ? minPtOut : 1n,
    });
    return {
      setupIxs: withComputeBudget(setupIxs),
      ixs: withComputeBudget(ixs),
      lookupTables: [
        market.addressLookupTable.toBase58(),
        market.vault.addressLookupTable.toBase58(),
      ],
      label: "Buy new PT",
    };
  }

  const vault = await loadVaultByPtMint(params.ptMint);
  const setupIxs: TransactionInstruction[] = [];
  if (!(await yieldPositionExists(owner, vault))) {
    setupIxs.push(vault.ixInitializeYieldPosition({ owner }));
  }
  const stripIx = await vault.ixStripFromBase({
    owner,
    amountBase: params.amountBase,
  });
  return {
    setupIxs: setupIxs.length ? withComputeBudget(setupIxs) : [],
    ixs: withComputeBudget([stripIx]),
    lookupTables: [vault.addressLookupTable.toBase58()],
    label: "Strip into new PT",
  };
}

export async function peekRolloverMints(sourcePtMint: string, destPtMint: string) {
  const sourceVault = await loadVaultByPtMint(sourcePtMint);
  return {
    sourcePtMint,
    destPtMint,
    baseMint: sourceVault.flavor.mintBase.toBase58(),
  };
}
