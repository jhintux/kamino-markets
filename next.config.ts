import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@kamino-finance/klend-sdk",
    "@kamino-finance/farms-sdk",
    "@kamino-finance/kliquidity-sdk",
    "@kamino-finance/scope-sdk",
    "@exponent-labs/exponent-sdk",
    "@exponent-labs/exponent-fetcher",
    "@coral-xyz/anchor",
  ],
};

export default nextConfig;
