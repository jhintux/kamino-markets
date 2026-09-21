"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { formatApy, formatPct, formatToken, formatUsd, isMatured, shortAddress } from "@/lib/format";
import { findRolloverSource, findRolloverSourceReserve } from "@/lib/rollover";
import type { ActionKind, MarketSnapshot, ObligationView, ReserveView, WalletBalances } from "@/lib/types";
import { ActionModal } from "./ActionModal";
import { HealthBar } from "./HealthBar";
import { TokenIcon } from "./TokenIcon";
import { WalletButton } from "./WalletButton";

type Tab = "loan" | "market";

export function App() {
  const { publicKey, connected } = useWallet();
  const [tab, setTab] = useState<Tab>("loan");
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [obligation, setObligation] = useState<ObligationView | null>(null);
  const [balances, setBalances] = useState<WalletBalances>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [modal, setModal] = useState<{ action: ActionKind; reserve: ReserveView } | null>(null);

  const loadMarket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/market", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setHint(data.hint ?? null);
        throw new Error(data.error || "Failed to load market");
      }
      setMarket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load market");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUser = useCallback(async () => {
    if (!publicKey) {
      setObligation(null);
      setBalances({});
      return;
    }
    const wallet = publicKey.toBase58();
    const [obligationRes, balancesRes] = await Promise.all([
      fetch(`/api/obligation?wallet=${wallet}`, { cache: "no-store" }),
      fetch(`/api/balances?wallet=${wallet}`, { cache: "no-store" }),
    ]);
    const obligationData = await obligationRes.json();
    const balancesData = await balancesRes.json();
    if (obligationRes.ok) setObligation(obligationData.obligation);
    if (balancesRes.ok) setBalances(balancesData.balances ?? {});
  }, [publicKey]);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const newReserves = market?.reserves.filter((reserve) => reserve.isNew) ?? [];
  const visibleReserves = market?.reserves ?? [];

  const reserveByMint = useMemo(() => {
    const map = new Map<string, ReserveView>();
    for (const reserve of visibleReserves) map.set(reserve.mint, reserve);
    return map;
  }, [visibleReserves]);

  function openAction(action: ActionKind, reserve: ReserveView) {
    setModal({ action, reserve });
  }

  return (
    <div className="min-h-screen flex bg-[#08101c] text-slate-100">
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-white/5 bg-[#0b1422] p-4">
        <div className="mb-8 px-2 text-sm font-semibold tracking-wide text-slate-300">Solstice</div>
        <NavButton active={tab === "loan"} onClick={() => setTab("loan")} icon="loan">
          My Loan
        </NavButton>
        <NavButton active={tab === "market"} onClick={() => setTab("market")} icon="market">
          Market Overview
        </NavButton>
      </aside>

      <main className="flex-1 p-4 md:p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Solstice Market</div>
            <div className="text-xs text-slate-400">
              {market ? shortAddress(market.address, 6) : "Loading on-chain state via Kamino SDK"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                void loadMarket();
                void loadUser();
              }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
            >
              Refresh
            </button>
            <WalletButton />
          </div>
        </header>

        <div className="mb-4 flex gap-2 md:hidden">
          <NavButton active={tab === "loan"} onClick={() => setTab("loan")} icon="loan">
            My Loan
          </NavButton>
          <NavButton active={tab === "market"} onClick={() => setTab("market")} icon="market">
            Market
          </NavButton>
        </div>

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-[#101827] p-8 text-sm text-slate-400">
            Loading Solstice Market from chain…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-medium">{error}</div>
            {hint && <div className="mt-2 text-red-200/80">{hint}</div>}
          </div>
        )}

        {market && !loading && tab === "loan" && (
          <LoanView
            market={market}
            obligation={obligation}
            connected={connected}
            newReserves={newReserves}
            balances={balances}
            reserveByMint={reserveByMint}
            onAction={openAction}
          />
        )}

        {market && !loading && tab === "market" && (
          <MarketTable
            reserves={visibleReserves}
            obligation={obligation}
            onAction={openAction}
          />
        )}
      </main>

      {modal && (
        <ActionModal
          action={modal.action}
          reserve={modal.reserve}
          obligation={obligation}
          walletBalance={balances[modal.reserve.mint]?.amount ?? 0}
          onClose={() => setModal(null)}
          onSuccess={() => {
            void loadMarket();
            void loadUser();
          }}
        />
      )}
    </div>
  );
}

function NavButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: "loan" | "market";
}) {
  return (
    <button
      onClick={onClick}
      className={`mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
        active ? "bg-[#1a2744] text-white ring-1 ring-sky-400/40" : "text-slate-400 hover:bg-white/5"
      }`}
    >
      <span className="text-base">{icon === "loan" ? "👤" : "☰"}</span>
      {children}
    </button>
  );
}

function LoanView({
  market,
  obligation,
  connected,
  newReserves,
  balances,
  reserveByMint,
  onAction,
}: {
  market: MarketSnapshot;
  obligation: ObligationView | null;
  connected: boolean;
  newReserves: ReserveView[];
  balances: WalletBalances;
  reserveByMint: Map<string, ReserveView>;
  onAction: (action: ActionKind, reserve: ReserveView) => void;
}) {
  const stats = [
    { label: "Net Value", value: obligation ? formatUsd(obligation.netValueUsd) : "—" },
    {
      label: "Net APY",
      value: obligation ? (obligation.netApy < 0 ? "<0%" : formatApy(obligation.netApy)) : "—",
      tone: obligation && obligation.netApy < 0 ? "text-orange-300" : "text-emerald-300",
    },
    { label: "Interest Earned", value: "$0" },
    {
      label: "LTV",
      value: obligation ? formatPct(obligation.ltv) : "—",
    },
    {
      label: "Max LTV",
      value: obligation ? formatPct(obligation.maxLtv) : "—",
    },
    {
      label: "Liq. LTV",
      value: obligation ? formatPct(obligation.liquidationLtv) : "—",
      tone: "text-orange-300",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-white/10 bg-[#101827] px-4 py-3">
            <div className="text-xs text-slate-400">{stat.label}</div>
            <div className={`mt-1 text-lg font-semibold ${stat.tone ?? ""}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {obligation && (
        <div className="rounded-2xl border border-white/10 bg-[#101827] px-4 py-4">
          <HealthBar ltv={obligation.ltv} liquidationLtv={obligation.liquidationLtv} />
        </div>
      )}

      {!connected && (
        <div className="rounded-2xl border border-white/10 bg-[#101827] p-5 text-sm text-slate-400">
          Connect a wallet to load your Solstice loan and deposit the newly listed PT assets.
        </div>
      )}

      {connected && !obligation && (
        <div className="rounded-2xl border border-white/10 bg-[#101827] p-5 text-sm text-slate-400">
          No vanilla obligation found for this wallet in Solstice Market.
        </div>
      )}

      {obligation && (
        <div className="grid gap-4 md:grid-cols-2">
          <PositionCard
            title="Supplied"
            total={formatUsd(obligation.suppliedUsd)}
            rows={obligation.deposits}
            reserveByMint={reserveByMint}
            kind="supply"
            onAction={onAction}
          />
          <PositionCard
            title="Borrowing"
            total={formatUsd(obligation.borrowedUsd)}
            rows={obligation.borrows}
            reserveByMint={reserveByMint}
            kind="borrow"
            onAction={onAction}
          />
        </div>
      )}

      {newReserves.length > 0 && (
        <div className="rounded-2xl border border-teal-400/20 bg-[#101827] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">Newly listed assets</div>
              <div className="text-xs text-slate-400">
                Hidden Kamino reserves that are live on-chain (including PT-eUSX-01DEC26 and PT-USX-01DEC26) but not shown in the official UI.
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {newReserves.map((reserve) => {
              const source = findRolloverSource(reserve, obligation?.deposits ?? []);
              const sourceReserve = findRolloverSourceReserve(reserve, market.reserves);
              const canRoll = Boolean(
                source ||
                  (sourceReserve && (balances[sourceReserve.mint]?.amount ?? 0) > 0) ||
                  (balances[reserve.mint]?.amount ?? 0) > 0
              );
              return (
              <div key={reserve.address} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-3">
                <div className="flex items-center gap-3">
                  <TokenIcon symbol={reserve.symbol} logoUrl={reserve.logoUrl} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{reserve.symbol}</span>
                      <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-teal-300">
                        New
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Wallet {formatToken(balances[reserve.mint]?.amount ?? 0)} · LTV {formatPct(reserve.ltv, 0)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onAction("rollover", reserve)}
                    disabled={!canRoll}
                    title={
                      canRoll
                        ? `Roll ${source?.symbol ?? sourceReserve?.symbol ?? "matured PT"} into ${reserve.symbol}`
                        : "Supply a matured PT of the same family first"
                    }
                    className="rounded-lg border border-teal-400/40 px-3 py-1.5 text-sm font-semibold text-teal-200 disabled:opacity-40"
                  >
                    Roll Over
                  </button>
                  <button
                    onClick={() => onAction("supply", reserve)}
                    className="rounded-lg bg-teal-400 px-3 py-1.5 text-sm font-semibold text-slate-900"
                  >
                    Supply
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      <MarketTable reserves={market.reserves} obligation={obligation} onAction={onAction} compact />
    </div>
  );
}

function PositionCard({
  title,
  total,
  rows,
  reserveByMint,
  kind,
  onAction,
}: {
  title: string;
  total: string;
  rows: ObligationView["deposits"];
  reserveByMint: Map<string, ReserveView>;
  kind: "supply" | "borrow";
  onAction: (action: ActionKind, reserve: ReserveView) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101827] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold">
          {title} <span className="text-slate-400">· {total}</span>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-3 text-xs text-slate-500">
        <span>Amount</span>
        <span>APY</span>
        <span />
      </div>
      <div className="space-y-3">
        {rows.length === 0 && <div className="text-sm text-slate-500">None</div>}
        {rows.map((row) => {
          const reserve = reserveByMint.get(row.mint);
          return (
            <div key={row.reserveAddress} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
              <div className="flex items-center gap-3">
                <TokenIcon symbol={row.symbol} logoUrl={reserve?.logoUrl} />
                <div>
                  <div className="font-medium">
                    {formatToken(row.amount)} <span className="text-slate-300">{row.symbol}</span>
                    {row.isNew && <span className="ml-2 text-[10px] uppercase text-teal-300">New</span>}
                    {isMatured(row.symbol) && <span className="ml-2 text-[10px] uppercase text-orange-300">Matured</span>}
                  </div>
                  <div className="text-xs text-slate-500">{formatUsd(row.amountUsd)}</div>
                </div>
              </div>
              <div className={kind === "borrow" ? "text-orange-300" : "text-emerald-300"}>{formatApy(row.apy)}</div>
              {reserve && (
                <button
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300"
                  onClick={() => onAction(kind === "supply" ? "withdraw" : "repay", reserve)}
                >
                  {kind === "supply" ? "Withdraw" : "Repay"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketTable({
  reserves,
  obligation,
  onAction,
  compact = false,
}: {
  reserves: ReserveView[];
  obligation?: ObligationView | null;
  onAction: (action: ActionKind, reserve: ReserveView) => void;
  compact?: boolean;
}) {
  const supplied = new Set(obligation?.deposits.map((row) => row.reserveAddress));
  const borrowed = new Set(obligation?.borrows.map((row) => row.reserveAddress));

  return (
    <div className="rounded-2xl border border-white/10 bg-[#101827] p-4">
      <div className="mb-4 font-semibold">Solstice Market</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="text-left">
              <th className="pb-3 font-medium">Asset</th>
              <th className="pb-3 font-medium">Total Supply</th>
              <th className="pb-3 font-medium">Total Borrow</th>
              <th className="pb-3 font-medium">Liq LTV</th>
              <th className="pb-3 font-medium">Supply APY</th>
              <th className="pb-3 font-medium">Borrow APY</th>
              <th className="pb-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {reserves.map((reserve) => (
              <tr key={reserve.address} className="border-t border-white/5">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <TokenIcon symbol={reserve.symbol} logoUrl={reserve.logoUrl} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{reserve.symbol}</span>
                        {reserve.isNew && (
                          <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[10px] uppercase text-teal-300">
                            New
                          </span>
                        )}
                        {reserve.isHidden && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                            Hidden
                          </span>
                        )}
                        {isMatured(reserve.symbol) && (
                          <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-[10px] uppercase text-orange-300">
                            Matured
                          </span>
                        )}
                      </div>
                      {!compact && (
                        <div className="text-[11px] text-slate-500">{shortAddress(reserve.mint, 4)}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 text-slate-200">{formatUsd(reserve.totalSupplyUsd)}</td>
                <td className="py-3 text-slate-200">{formatUsd(reserve.totalBorrowUsd)}</td>
                <td className="py-3 text-slate-200">{reserve.liquidationLtv ? formatPct(reserve.liquidationLtv, 0) : "0%"}</td>
                <td className={`py-3 ${reserve.supplyApy > 0 ? "text-emerald-300" : "text-slate-400"}`}>
                  {reserve.supplyApy > 0 ? formatApy(reserve.supplyApy) : "—"}
                </td>
                <td className={`py-3 ${reserve.canBorrow ? "text-orange-300" : "text-slate-500"}`}>
                  {reserve.canBorrow ? formatApy(reserve.borrowApy) : "—"}
                </td>
                <td className="py-3">
                  <div className="flex justify-end gap-2">
                    {reserve.canSupply && (
                      <button
                        onClick={() => onAction("supply", reserve)}
                        className="rounded-lg bg-[#243044] px-3 py-1.5 text-xs font-medium hover:bg-[#2d3b52]"
                      >
                        {supplied.has(reserve.address) ? "Manage" : "Supply"}
                      </button>
                    )}
                    {reserve.canBorrow && (
                      <button
                        onClick={() => onAction(borrowed.has(reserve.address) ? "repay" : "borrow", reserve)}
                        className="rounded-lg bg-[#243044] px-3 py-1.5 text-xs font-medium text-orange-200 hover:bg-[#2d3b52]"
                      >
                        {borrowed.has(reserve.address) ? "Repay" : "Borrow"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
