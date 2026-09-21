"use client";

import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { formatApy, formatPct, formatToken, formatUsd } from "@/lib/format";
import { findRolloverSource, maxSafeWithdrawAmount } from "@/lib/rollover";
import type {
  ActionKind,
  BuiltTransaction,
  ObligationView,
  ReserveView,
  RolloverResponse,
} from "@/lib/types";
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

  const rolloverSource = useMemo(
    () => (action === "rollover" && obligation ? findRolloverSource(reserve, obligation.deposits) : null),
    [action, obligation, reserve]
  );

  const positionAmount = useMemo(() => {
    if (!obligation) return 0;
    if (action === "rollover") return rolloverSource?.amount ?? 0;
    const list = action === "withdraw" ? obligation.deposits : obligation.borrows;
    return list.find((pos) => pos.reserveAddress === reserve.address)?.amount ?? 0;
  }, [action, obligation, reserve.address, rolloverSource]);

  const withdrawPosition =
    action === "withdraw" && obligation
      ? obligation.deposits.find((pos) => pos.reserveAddress === reserve.address) ?? null
      : null;

  const safeRolloverMax =
    action === "rollover" && obligation && rolloverSource
      ? maxSafeWithdrawAmount(obligation, rolloverSource)
      : action === "withdraw" && obligation && withdrawPosition
        ? maxSafeWithdrawAmount(obligation, withdrawPosition)
        : positionAmount;

  const maxAmount =
    action === "rollover" || action === "withdraw"
      ? safeRolloverMax
      : action === "supply" || action === "repay"
        ? action === "repay"
          ? Math.min(walletBalance, positionAmount || walletBalance)
          : walletBalance
        : positionAmount;

  const title =
    action === "supply"
      ? "Supply"
      : action === "withdraw"
        ? "Withdraw"
        : action === "borrow"
          ? "Borrow"
          : action === "rollover"
            ? "Roll Over"
            : "Repay";

  async function signAndSend(builtTxs: BuiltTransaction[]) {
    if (!signTransaction) throw new Error("Wallet cannot sign");
    let lastSig = "";
    for (let i = 0; i < builtTxs.length; i++) {
      const built = builtTxs[i];
      setStatus(
        builtTxs.length > 1
          ? `Sign ${i + 1} of ${builtTxs.length}: ${built.label}`
          : built.label || "Confirm in wallet…"
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
    return lastSig;
  }

  async function submitRollover() {
    if (!publicKey) throw new Error("Connect a wallet first");
    let lastSig = "";
    for (let step = 0; step < 8; step++) {
      setStatus("Building next rollover transaction…");
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          reserveAddress: reserve.address,
          amount: amount || undefined,
          action: "rollover",
        }),
      });
      const data = (await response.json()) as RolloverResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to build rollover");
      if (data.done) {
        setStatus(data.message);
        return lastSig;
      }
      if (!data.transactions?.length) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      setStatus(data.message);
      lastSig = await signAndSend(data.transactions);
    }
    throw new Error("Rollover did not finish after several steps. Refresh and try again.");
  }

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
      if (action === "rollover") {
        const lastSig = await submitRollover();
        if (lastSig) setSignature(lastSig);
        onSuccess();
        return;
      }

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

      const lastSig = await signAndSend(data.transactions as BuiltTransaction[]);
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

        {reserve.isNew && action !== "rollover" && (
          <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-teal-200">
                  Newly listed on-chain as a Hidden reserve, so it is omitted from the official Kamino UI.
          </div>
        )}

        {action === "rollover" && (
          <div className="mb-4 space-y-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-3 text-xs text-teal-100">
            <div>
              Withdraw matured {rolloverSource?.symbol ?? "PT"}, redeem it on{" "}
              <a
                href="https://docs.exponent.finance/developers/choosing-your-sdk"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Exponent
              </a>
              , convert into {reserve.symbol}, then supply it. Each step is a separate wallet signature.
            </div>
            {obligation && obligation.borrowedUsd > 0 && (
              <div className="text-amber-200">
                Open borrow stays in place. Kamino lets you withdraw until max LTV
                {rolloverSource && rolloverSource.ltv > 0 ? ` (${formatPct(rolloverSource.ltv, 0)})` : ""}
                {safeRolloverMax < positionAmount
                  ? `, so this rolls ${formatToken(safeRolloverMax)} of ${formatToken(positionAmount)}. Repeat after it supplies.`
                  : "."}
              </div>
            )}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
          <span>Wallet balance: {formatToken(walletBalance)}</span>
          {(action === "withdraw" || action === "repay" || action === "rollover") && (
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

        {action !== "rollover" && (
          <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
            <div>Value ≈ {formatUsd((Number(amount) || 0) * reserve.priceUsd)}</div>
            <div className="text-right">
              {action === "borrow" || action === "repay" ? "Borrow APY" : "Supply APY"}{" "}
              <span className={action === "borrow" || action === "repay" ? "text-orange-300" : "text-emerald-300"}>
                {formatApy(action === "borrow" || action === "repay" ? reserve.borrowApy : reserve.supplyApy)}
              </span>
            </div>
          </div>
        )}

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
          disabled={busy || (action !== "rollover" && !Number(amount))}
          onClick={() => submit(false)}
          className="w-full rounded-xl bg-teal-400 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          {busy ? status || "Confirm in wallet…" : title}
        </button>
      </div>
    </div>
  );
}
