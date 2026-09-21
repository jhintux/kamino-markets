"use client";

import { useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { PUBLIC_RPC } from "@/lib/constants";

export function Providers({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Adapter[]>([]);

  useEffect(() => {
    setWallets([new PhantomWalletAdapter(), new SolflareWalletAdapter()]);
  }, []);

  return (
    <ConnectionProvider endpoint={PUBLIC_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
