export const SOLSTICE_MARKET =
  "9Y7uwXgQ68mGqRtZfuFaP4hc4fxeJ7cE9zTtqTxVhfGU";

export const MARKET_LOOKUP_TABLE =
  "BwR37YKGzrAx6C6G7gk3UvmRKVHBTsD2DgD4R4stDGJ9";

export const SLOT_DURATION_MS = 400;

/**
 * Newly listed PT assets. The addresses from the announcement are the
 * reserve liquidity vaults; the mints they hold are the actual deposit tokens.
 */
export const NEW_ASSETS: Record<string, { symbol: string; name: string }> = {
  CAuiv9V7HrgxbDTsC9qqvzrbpRM1pqr7he2nY8vFKNfz: {
    symbol: "PT-eUSX-01DEC26",
    name: "PT-eUSX-01DEC26",
  },
  FVS7CoMmdQRfby3ZrFwLDj236VCzGcd9tytZPxq5Q3rh: {
    symbol: "PT-USX-01DEC26",
    name: "PT-USX-01DEC26",
  },
};

export const TOKEN_LOGOS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:
    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
};

export const DEFAULT_RPC =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

export const PUBLIC_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export const U64_MAX = "18446744073709551615";
