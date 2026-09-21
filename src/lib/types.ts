export type ReserveStatus = "Active" | "Obsolete" | "Hidden" | string;

export type ReserveView = {
  address: string;
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  status: ReserveStatus;
  isNew: boolean;
  isHidden: boolean;
  isObsolete: boolean;
  isUiDeprecated: boolean;
  priceUsd: number;
  totalSupply: number;
  totalBorrow: number;
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  supplyApy: number;
  borrowApy: number;
  utilization: number;
  ltv: number;
  liquidationLtv: number;
  depositLimit: number;
  borrowLimit: number;
  canSupply: boolean;
  canBorrow: boolean;
  logoUrl?: string;
};

export type PositionView = {
  reserveAddress: string;
  mint: string;
  symbol: string;
  amount: number;
  amountUsd: number;
  apy: number;
  isNew: boolean;
};

export type ObligationView = {
  address: string;
  tag: number;
  netValueUsd: number;
  suppliedUsd: number;
  borrowedUsd: number;
  ltv: number;
  liquidationLtv: number;
  borrowUtilization: number;
  netApy: number;
  deposits: PositionView[];
  borrows: PositionView[];
};

export type MarketSnapshot = {
  name: string;
  address: string;
  loadedAt: string;
  slot: string;
  totalDepositTvl: number;
  totalBorrowTvl: number;
  reserves: ReserveView[];
};

export type WalletBalances = Record<string, { amount: number; mint: string }>;

export type ActionKind = "supply" | "withdraw" | "borrow" | "repay";

export type BuiltTransaction = {
  transaction: string;
  lastValidBlockHeight: number;
  label: string;
};
