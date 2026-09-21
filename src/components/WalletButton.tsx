"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { shortAddress } from "@/lib/format";

export function WalletButton() {
  const { publicKey, connected, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-lg bg-[#1b2536] px-3 py-2 text-xs font-semibold hover:bg-[#243044]"
      >
        {shortAddress(publicKey.toBase58(), 4)}
      </button>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)}
      className="rounded-lg bg-teal-400 px-3 py-2 text-xs font-semibold text-slate-900"
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
