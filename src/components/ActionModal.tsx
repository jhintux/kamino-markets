"use client";

import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { formatApy, formatToken, formatUsd } from "@/lib/format";
import type { ActionKind, BuiltTransaction, ObligationView, ReserveView } from "@/lib/types";
import { TokenIcon } from "./TokenIcon";

export function ActionModal({
  action,
  reserve,
  obligation,
  walletBalance,
  onClose,
  onSuccess,
}: {
  action: ActionKind;
  reserve: ReserveView;
  obligation: ObligationView | null;
  walletBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const positionAmount = useMemo(() => {
    if (!obligation) return 0;
    const list = action === "withdraw" ? obligation.deposits : obligation.borrows;
    return list.find((pos) => pos.reserveAddress === reserve.address)?.amount ?? 0;
  }, [action, obligation, reserve.address]);

  const maxAmount =
    action === "supply" || action === "repay"
      ? action === "repay"
        ? Math.min(walletBalance, positionAmount || walletBalance)
        : walletBalance
      : positionAmount;

  const title =
    action === "supply" ? "Supply" : action === "withdraw" ? "Withdraw" : action === "borrow" ? "Borrow" : "Repay";

  async function submit(useMax = false) {
    if (!publicKey || !signTransaction) {
      setError("Connect a wallet first");
      return;
    }
    setBusy(true);
    setError(null);
    setSignature(null);
    setStatus(null);

    try {
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          reserveAddress: reserve.address,
          amount: useMax ? maxAmount.toString() : amount,
          action,
          max: useMax && (action === "repay" || action === "withdraw"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to build transaction");

      const builtTxs = data.transactions as BuiltTransaction[];
      let lastSig = "";
      for (let i = 0; i < builtTxs.length; i++) {
        const built = builtTxs[i];
        setStatus(
          builtTxs.length > 1
            ? `Sign ${i + 1} of ${builtTxs.length}: ${built.label}`
            : "Confirm in wallet…"
        );
        const tx = VersionedTransaction.deserialize(Buffer.from(built.transaction, "base64"));
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.message.recentBlockhash = blockhash;

        const signed = await signTransaction(tx);
        lastSig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
        });
        await connection.confirmTransaction(
          { signature: lastSig, blockhash, lastValidBlockHeight },
          "confirmed"
        );
      }

      setSignature(lastSig);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101827] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <TokenIcon symbol={reserve.symbol} logoUrl={reserve.logoUrl} />
            <div>
              <div className="text-sm text-slate-400">{title}</div>
              <div className="font-semibold">{reserve.symbol}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {reserve.isNew && (
          <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-teal-200">
                  Newly listed on-chain as a Hidden reserve, so it is omitted from the official Kamino UI.
          </div>
        )}

        <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
          <span>Wallet balance: {formatToken(walletBalance)}</span>
          {(action === "withdraw" || action === "repay") && (
            <span>Position: {formatToken(positionAmount)}</span>
          )}
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b1422] px-3 py-2">
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent text-lg outline-none"
            inputMode="decimal"
          />
          <button
            className="rounded-md bg-white/10 px-2 py-1 text-xs"
            onClick={() => setAmount(String(maxAmount || ""))}
          >
            MAX
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
          <div>Value ≈ {formatUsd((Number(amount) || 0) * reserve.priceUsd)}</div>
          <div className="text-right">
            {action === "borrow" || action === "repay" ? "Borrow APY" : "Supply APY"}{" "}
            <span className={action === "borrow" || action === "repay" ? "text-orange-300" : "text-emerald-300"}>
              {formatApy(action === "borrow" || action === "repay" ? reserve.borrowApy : reserve.supplyApy)}
            </span>
          </div>
        </div>

        {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        {signature && (
          <a
            className="mb-3 block rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"
            href={`https://solscan.io/tx/${signature}`}
            target="_blank"
            rel="noreferrer"
          >
            Confirmed · view on Solscan
          </a>
        )}

        <button
          disabled={busy || !Number(amount)}
          onClick={() => submit(false)}
          className="w-full rounded-xl bg-teal-400 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          {busy ? status || "Confirm in wallet…" : title}
        </button>
      </div>
    </div>
  );
}
